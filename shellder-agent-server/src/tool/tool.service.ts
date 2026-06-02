import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Tool, ToolType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ErDiagramService } from '../connector/er-diagram.service';
import { ErDiagram } from '../connector/connector-schema.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateToolDto } from './dto/create-tool.dto';
import { QueryToolDto } from './dto/query-tool.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import {
  assertValidJsonSchema,
} from './schema-validator.util';
import {
  DEFAULT_SQL_CONFIG,
  HttpToolConfig,
  SqlToolConfig,
  ToolConfig,
  TOOL_TYPE_CONNECTOR_TYPE,
} from './tool.types';

/** 详情中「最近调用日志」展示条数 */
const RECENT_CALL_LIMIT = 20;
/** 成功率 / 失败率 / 耗时统计样本窗口 */
const STATS_SAMPLE_SIZE = 100;

/** 连接器关联视图（详情 / 列表展示） */
const CONNECTOR_SELECT = {
  select: { id: true, name: true, type: true, status: true },
} as const;

/**
 * Tool 注册与管理服务（功能清单 §1.5 / 架构 §4.3）。
 *
 * 跨租户隔离（同 05/06）：
 * - 超级管理员：可见 / 可维护全部，可选 ?tenantId 过滤。
 * - 非超管：仅可见 / 可维护其绑定租户内 Tool。
 * 禁用租户不可新建 Tool；保存时校验 inputSchema/outputSchema 为合法 JSON Schema（验收标准 1）；
 * 关联连接器须同租户且类型匹配，并满足连接器 allowedToolScopes 约束。
 */
@Injectable()
export class ToolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly erDiagram: ErDiagramService,
  ) {}

  async create(user: AuthUser, dto: CreateToolDto) {
    await this.assertTenantAccess(user, dto.tenantId);
    await this.assertTenantEnabled(dto.tenantId);

    this.validateSchemas(dto.inputSchema, dto.outputSchema);
    const config = this.normalizeConfig(dto.type, dto.config);
    await this.validateConnectorBinding(
      dto.tenantId,
      dto.type,
      dto.connectorId,
      dto.permissionScope,
    );

    try {
      const tool = await this.prisma.tool.create({
        data: {
          tenantId: dto.tenantId,
          name: dto.name,
          description: dto.description ?? null,
          type: dto.type,
          inputSchema: dto.inputSchema as unknown as Prisma.InputJsonValue,
          outputSchema: (dto.outputSchema ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          permissionScope: dto.permissionScope ?? null,
          riskLevel: dto.riskLevel ?? 'low',
          needConfirmation: dto.needConfirmation ?? false,
          timeoutMs: dto.timeoutMs ?? 10000,
          idempotencyKey: dto.idempotencyKey ?? null,
          auditEventType: dto.auditEventType ?? null,
          connectorId: dto.connectorId || null,
          config: config as unknown as Prisma.InputJsonValue,
        },
        include: { connector: CONNECTOR_SELECT },
      });
      return this.toView(tool);
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async findMany(user: AuthUser, query: QueryToolDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ToolWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.riskLevel) where.riskLevel = query.riskLevel;
    if (query.connectorId) where.connectorId = query.connectorId;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { description: { contains: query.keyword } },
        { permissionScope: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tool.count({ where }),
      this.prisma.tool.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { connector: CONNECTOR_SELECT },
      }),
    ]);

    return { items: rows.map((t) => this.toView(t)), total, page, pageSize };
  }

  /** 详情：定义 / 约束 / 权限 / 关联连接器 + 最近调用与成功率/失败率/耗时（04 tool_call_audit）。 */
  async findOne(user: AuthUser, id: string) {
    const tool = await this.getOrThrow(id);
    await this.assertTenantAccess(user, tool.tenantId);

    const [recentCalls, sample] = await this.prisma.$transaction([
      this.prisma.toolCallAudit.findMany({
        where: { toolId: id },
        orderBy: { createdAt: 'desc' },
        take: RECENT_CALL_LIMIT,
      }),
      this.prisma.toolCallAudit.findMany({
        where: { toolId: id },
        orderBy: { createdAt: 'desc' },
        take: STATS_SAMPLE_SIZE,
        select: { status: true, durationMs: true },
      }),
    ]);

    const totalSample = sample.length;
    const success = sample.filter((s) => s.status === 'success').length;
    const failed = sample.filter((s) => s.status === 'failed').length;
    const durations = sample.map((s) => s.durationMs ?? 0).filter((d) => d > 0);
    const avgDurationMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    const erSummary = await this.buildErPublishedSummary(tool);

    return {
      ...this.toView(tool),
      erPublishedSummary: erSummary,
      stats: {
        sampleSize: totalSample,
        successRate: totalSample ? Math.round((success / totalSample) * 1000) / 1000 : 0,
        failureRate: totalSample ? Math.round((failed / totalSample) * 1000) / 1000 : 0,
        avgDurationMs,
      },
      recentCalls: recentCalls.map((r) => ({
        id: r.id,
        status: r.status,
        callerName: r.callerName,
        requestSummary: r.requestSummary,
        errorMessage: r.errorMessage,
        durationMs: r.durationMs,
        highRisk: r.highRisk,
        createdAt: r.createdAt,
      })),
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateToolDto) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    const nextType = dto.type ?? existing.type;
    if (dto.inputSchema !== undefined || dto.outputSchema !== undefined) {
      this.validateSchemas(
        dto.inputSchema ?? (existing.inputSchema as Record<string, unknown>),
        dto.outputSchema,
      );
    }

    const data: Prisma.ToolUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.inputSchema !== undefined)
      data.inputSchema = dto.inputSchema as unknown as Prisma.InputJsonValue;
    if (dto.outputSchema !== undefined)
      data.outputSchema = dto.outputSchema as unknown as Prisma.InputJsonValue;
    if (dto.permissionScope !== undefined)
      data.permissionScope = dto.permissionScope || null;
    if (dto.riskLevel !== undefined) data.riskLevel = dto.riskLevel;
    if (dto.needConfirmation !== undefined) data.needConfirmation = dto.needConfirmation;
    if (dto.timeoutMs !== undefined) data.timeoutMs = dto.timeoutMs;
    if (dto.idempotencyKey !== undefined)
      data.idempotencyKey = dto.idempotencyKey || null;
    if (dto.auditEventType !== undefined)
      data.auditEventType = dto.auditEventType || null;

    // config：若传入则按（新）类型归一化；类型变更但未传 config 时按现有 config 迁移到新类型
    if (dto.config !== undefined || dto.type !== undefined) {
      const baseConfig =
        dto.config ?? (existing.config as unknown as Record<string, unknown>);
      data.config = this.normalizeConfig(
        nextType,
        baseConfig,
      ) as unknown as Prisma.InputJsonValue;
    }

    // 连接器解绑 / 改绑
    const nextConnectorId =
      dto.connectorId === undefined
        ? existing.connectorId
        : dto.connectorId || null;
    if (dto.connectorId !== undefined || dto.type !== undefined) {
      const nextScope =
        dto.permissionScope !== undefined
          ? dto.permissionScope
          : existing.permissionScope;
      await this.validateConnectorBinding(
        existing.tenantId,
        nextType,
        nextConnectorId ?? undefined,
        nextScope ?? undefined,
      );
      data.connector = nextConnectorId
        ? { connect: { id: nextConnectorId } }
        : { disconnect: true };
    }

    try {
      const tool = await this.prisma.tool.update({
        where: { id },
        data,
        include: { connector: CONNECTOR_SELECT },
      });
      return this.toView(tool);
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async updateStatus(user: AuthUser, id: string, status: Tool['status']) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    const tool = await this.prisma.tool.update({
      where: { id },
      data: { status },
      include: { connector: CONNECTOR_SELECT },
    });
    return this.toView(tool);
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    await this.prisma.tool.delete({ where: { id } });
    return { id };
  }

  private async buildErPublishedSummary(tool: Tool) {
    if (tool.type !== 'query' || !tool.connectorId) return null;
    const meta = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId: tool.connectorId },
    });
    if (!meta?.erDiagramPublished) return null;
    const published = meta.erDiagramPublished as unknown as ErDiagram;
    return {
      tableCount: published.tables?.length ?? 0,
      relationshipCount: published.relationships?.length ?? 0,
      version: meta.erPublishedVersion,
      publishedAt: meta.erPublishedAt,
    };
  }

  // ── 校验与归一化 ─────────────────────────────────────────

  /** 校验 inputSchema/outputSchema 为合法 JSON Schema（验收标准 1）。 */
  private validateSchemas(inputSchema: unknown, outputSchema?: unknown) {
    const input = assertValidJsonSchema(inputSchema);
    if (!input.valid) {
      throw new BadRequestException({
        code: 'INVALID_INPUT_SCHEMA',
        message: `inputSchema 不是合法 JSON Schema：${input.errors.join('；')}`,
      });
    }
    if (outputSchema !== undefined && outputSchema !== null) {
      const output = assertValidJsonSchema(outputSchema);
      if (!output.valid) {
        throw new BadRequestException({
          code: 'INVALID_OUTPUT_SCHEMA',
          message: `outputSchema 不是合法 JSON Schema：${output.errors.join('；')}`,
        });
      }
    }
  }

  /** 按类型归一化 config，并对 SQL 工具配置做约束校验。 */
  private normalizeConfig(
    type: ToolType,
    raw?: Record<string, unknown> | null,
  ): ToolConfig {
    const src = (raw ?? {}) as ToolConfig;
    switch (type) {
      case 'query': {
        const sql = this.normalizeSqlConfig(src.sql);
        return { sql };
      }
      case 'action':
      case 'notification': {
        const http = this.normalizeHttpConfig(src.http);
        return { http };
      }
      case 'workflow': {
        const steps = Array.isArray(src.workflow?.steps) ? src.workflow!.steps : [];
        return { workflow: { steps } };
      }
      default:
        return {};
    }
  }

  private normalizeSqlConfig(raw?: SqlToolConfig): SqlToolConfig {
    const c = raw ?? DEFAULT_SQL_CONFIG;
    const maxRows = Number(c.maxRows);
    const maxExecutionMs = Number(c.maxExecutionMs);
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100000) {
      throw new BadRequestException({
        code: 'SQL_CONFIG_INVALID',
        message: 'SQL 工具最大返回行数须为 1–100000 的整数',
      });
    }
    if (!Number.isInteger(maxExecutionMs) || maxExecutionMs < 100 || maxExecutionMs > 600000) {
      throw new BadRequestException({
        code: 'SQL_CONFIG_INVALID',
        message: 'SQL 工具最大执行时长须为 100–600000 毫秒',
      });
    }
    return {
      tableBlacklist: this.strArray(c.tableBlacklist),
      fieldBlacklist: this.strArray(c.fieldBlacklist),
      maxRows,
      maxExecutionMs,
      templates: Array.isArray(c.templates)
        ? c.templates
            .filter((t) => t && typeof t.sql === 'string' && typeof t.name === 'string')
            .map((t) => ({
              id: t.id || randomUUID(),
              name: t.name,
              sql: t.sql,
              description: t.description,
            }))
        : [],
    };
  }

  private normalizeHttpConfig(raw?: HttpToolConfig): HttpToolConfig {
    const c = raw ?? ({} as HttpToolConfig);
    return {
      method: (c.method || 'POST').toUpperCase(),
      path: c.path || '',
      headers:
        c.headers && typeof c.headers === 'object'
          ? (c.headers as Record<string, string>)
          : {},
      bodyTemplate: c.bodyTemplate,
    };
  }

  /** 关联连接器校验：同租户、类型匹配、满足连接器 allowedToolScopes 约束。 */
  private async validateConnectorBinding(
    tenantId: string,
    type: ToolType,
    connectorId?: string,
    permissionScope?: string,
  ) {
    if (!connectorId) {
      // 非 workflow 型建议绑定连接器，但不强制（允许先建后绑）
      return;
    }
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
    });
    if (!connector) {
      throw new NotFoundException({
        code: 'CONNECTOR_NOT_FOUND',
        message: `连接器不存在：${connectorId}`,
      });
    }
    if (connector.tenantId !== tenantId) {
      throw new BadRequestException({
        code: 'CONNECTOR_TENANT_MISMATCH',
        message: '连接器与 Tool 不属于同一租户',
      });
    }
    const expected = TOOL_TYPE_CONNECTOR_TYPE[type];
    if (expected && connector.type !== expected) {
      throw new BadRequestException({
        code: 'CONNECTOR_TYPE_MISMATCH',
        message: `该 Tool 类型应关联 ${expected} 连接器，当前连接器类型为 ${connector.type}`,
      });
    }
    // 连接器 allowedToolScopes 约束（06 config.allowedToolScopes）
    const allowed =
      (connector.config as { allowedToolScopes?: string[] })?.allowedToolScopes ?? [];
    if (allowed.length > 0 && permissionScope && !allowed.includes(permissionScope)) {
      throw new BadRequestException({
        code: 'TOOL_SCOPE_NOT_ALLOWED',
        message: `连接器仅允许范围 [${allowed.join(', ')}]，Tool 权限范围 ${permissionScope} 不在其中`,
      });
    }
  }

  // ── 隔离与查询辅助（同 06 连接器） ────────────────────────

  async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的工具访问权限',
      });
    }
  }

  private async assertTenantEnabled(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `租户不存在：${tenantId}`,
      });
    }
    if (tenant.status === 'disabled') {
      throw new ForbiddenException({
        code: 'TENANT_DISABLED',
        message: '该租户已禁用，不可新建工具',
      });
    }
  }

  private async resolveTenantFilter(
    user: AuthUser,
    requestedTenantId?: string,
  ): Promise<string | Prisma.StringFilter | undefined> {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) {
      return requestedTenantId || undefined;
    }
    const allowed = user.tenantIds ?? [];
    if (requestedTenantId && allowed.includes(requestedTenantId)) {
      return requestedTenantId;
    }
    return { in: allowed };
  }

  /** 供调用测试服务复用：取 Tool 并校验租户访问权。 */
  async getForUser(user: AuthUser, id: string): Promise<Tool> {
    const tool = await this.getOrThrow(id);
    await this.assertTenantAccess(user, tool.tenantId);
    return tool;
  }

  private async getOrThrow(id: string): Promise<Tool> {
    const tool = await this.prisma.tool.findUnique({ where: { id } });
    if (!tool) {
      throw new NotFoundException({
        code: 'TOOL_NOT_FOUND',
        message: `工具不存在：${id}`,
      });
    }
    return tool;
  }

  private mapUniqueError(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new BadRequestException({
        code: 'TOOL_NAME_DUPLICATED',
        message: '同租户下已存在同名工具',
      });
    }
    return err;
  }

  private strArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  }

  readConfig(tool: Tool): ToolConfig {
    const raw = tool.config;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as ToolConfig;
    }
    return {};
  }

  private toView(
    tool: Tool & { connector?: { id: string; name: string; type: string; status: string } | null },
  ) {
    return {
      id: tool.id,
      tenantId: tool.tenantId,
      name: tool.name,
      description: tool.description,
      type: tool.type,
      status: tool.status,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      permissionScope: tool.permissionScope,
      riskLevel: tool.riskLevel,
      needConfirmation: tool.needConfirmation,
      timeoutMs: tool.timeoutMs,
      idempotencyKey: tool.idempotencyKey,
      auditEventType: tool.auditEventType,
      connectorId: tool.connectorId,
      connector: tool.connector
        ? {
            id: tool.connector.id,
            name: tool.connector.name,
            type: tool.connector.type,
            status: tool.connector.status,
          }
        : null,
      config: this.readConfig(tool),
      createdAt: tool.createdAt,
      updatedAt: tool.updatedAt,
    };
  }
}
