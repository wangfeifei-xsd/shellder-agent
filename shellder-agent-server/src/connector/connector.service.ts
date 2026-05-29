import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Connector,
  ConnectorStatus,
  ConnectorTestStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { AuditService } from '../audit/audit.service';
import { ConnectivityTestService } from './connectivity-test.service';
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from './connector-secret.util';
import {
  ConnectorConfig,
  EMPTY_CONNECTOR_CONFIG,
} from './connector.types';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { QueryConnectorDto } from './dto/query-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

/** 详情中「最近调用日志」展示条数 */
const RECENT_CALL_LIMIT = 20;
/** 失败率 / 超时统计的样本窗口 */
const STATS_SAMPLE_SIZE = 100;

/**
 * 连接器配置与连通性服务（功能清单 §1.6）。
 * 跨租户隔离（同 05 规则）：
 * - 超级管理员：可见 / 可维护全部，可选 ?tenantId 过滤。
 * - 非超管：仅可见 / 可维护其绑定租户内连接器。
 * 禁用租户不可新建连接器（验收标准 3）。
 * 凭证加密落库、详情脱敏（功能清单 §1.6）；连通性测试记入 04 外部接口审计。
 */
@Injectable()
export class ConnectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly audit: AuditService,
    private readonly connectivity: ConnectivityTestService,
  ) {}

  async create(user: AuthUser, dto: CreateConnectorDto) {
    await this.assertTenantAccess(user, dto.tenantId);
    await this.assertTenantEnabled(dto.tenantId);

    const config: ConnectorConfig = {
      properties: dto.properties ?? {},
      allowedToolScopes: dto.allowedToolScopes ?? [],
      secretCipher: encryptSecret(dto.secret),
    };

    const connector = await this.prisma.connector.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        type: dto.type,
        target: dto.target,
        authType: dto.authType ?? 'none',
        timeoutMs: dto.timeoutMs ?? 5000,
        description: dto.description ?? null,
        config: config as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toView(connector);
  }

  async findMany(user: AuthUser, query: QueryConnectorDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ConnectorWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { target: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.connector.count({ where }),
      this.prisma.connector.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((c) => this.toView(c)), total, page, pageSize };
  }

  /** 详情：配置摘要（脱敏）+ 关联 Tool 列表（07 占位）+ 最近调用日志与统计（04 外部接口审计）。 */
  async findOne(user: AuthUser, id: string) {
    const connector = await this.getOrThrow(id);
    await this.assertTenantAccess(user, connector.tenantId);

    const [recentCalls, sample] = await this.prisma.$transaction([
      this.prisma.externalCallAudit.findMany({
        where: { connectorId: id },
        orderBy: { createdAt: 'desc' },
        take: RECENT_CALL_LIMIT,
      }),
      this.prisma.externalCallAudit.findMany({
        where: { connectorId: id },
        orderBy: { createdAt: 'desc' },
        take: STATS_SAMPLE_SIZE,
        select: { status: true, durationMs: true },
      }),
    ]);

    const totalSample = sample.length;
    const failed = sample.filter((s) => s.status === 'failed').length;
    const durations = sample.map((s) => s.durationMs ?? 0).filter((d) => d > 0);
    const avgDurationMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    // 超过连接器超时阈值视为超时调用
    const timeoutCount = sample.filter(
      (s) => (s.durationMs ?? 0) > connector.timeoutMs,
    ).length;

    return {
      ...this.toView(connector),
      // 关联 Tool 列表：07-工具管理 就绪后按 allowedToolScopes 反查；当前为占位空列表
      relatedTools: [] as { id: string; name: string }[],
      stats: {
        sampleSize: totalSample,
        failureRate: totalSample ? Math.round((failed / totalSample) * 1000) / 1000 : 0,
        avgDurationMs,
        timeoutCount,
      },
      recentCalls: recentCalls.map((r) => ({
        id: r.id,
        target: r.target,
        method: r.method,
        status: r.status,
        statusCode: r.statusCode,
        durationMs: r.durationMs,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt,
      })),
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateConnectorDto) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    const current = this.readConfig(existing);
    const config: ConnectorConfig = {
      properties: dto.properties ?? current.properties,
      allowedToolScopes: dto.allowedToolScopes ?? current.allowedToolScopes,
      secretCipher: this.resolveSecretCipher(dto, current),
    };

    const data: Prisma.ConnectorUpdateInput = {
      config: config as unknown as Prisma.InputJsonValue,
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.target !== undefined) data.target = dto.target;
    if (dto.authType !== undefined) data.authType = dto.authType;
    if (dto.timeoutMs !== undefined) data.timeoutMs = dto.timeoutMs;
    if (dto.description !== undefined) data.description = dto.description || null;

    const connector = await this.prisma.connector.update({ where: { id }, data });
    return this.toView(connector);
  }

  async updateStatus(user: AuthUser, id: string, status: ConnectorStatus) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    const connector = await this.prisma.connector.update({
      where: { id },
      data: { status },
    });
    return this.toView(connector);
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    await this.prisma.connector.delete({ where: { id } });
    return { id };
  }

  /**
   * 连通性测试（验收标准 2）：执行测试 → 记入 04 外部接口审计 → 更新最近测试快照。
   */
  async test(user: AuthUser, id: string) {
    const connector = await this.getOrThrow(id);
    await this.assertTenantAccess(user, connector.tenantId);

    const result = await this.connectivity.test(connector);

    // 记入外部接口审计（架构 §5：外部调用必须记录）
    await this.audit.logExternalCall({
      tenantId: connector.tenantId,
      connectorId: connector.id,
      target: connector.target,
      method: connector.type === 'db_readonly' ? 'TCP' : 'GET',
      callerUserId: user.id,
      requestSummary: `连通性测试：${connector.name}（${connector.type}）`,
      status: result.ok ? 'success' : 'failed',
      statusCode: result.statusCode ?? null,
      durationMs: result.latencyMs,
      errorMessage: result.ok ? null : result.message,
    });

    // 更新最近测试快照（供列表 / 详情展示）
    await this.prisma.connector.update({
      where: { id },
      data: {
        lastTestStatus: result.ok
          ? ConnectorTestStatus.success
          : ConnectorTestStatus.failed,
        lastTestLatencyMs: result.latencyMs,
        lastTestMessage: result.message.slice(0, 512),
        lastTestedAt: new Date(),
      },
    });

    return result;
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private resolveSecretCipher(
    dto: UpdateConnectorDto,
    current: ConnectorConfig,
  ): string | null {
    if (dto.clearSecret) return null;
    if (dto.secret === undefined) return current.secretCipher; // 未传 → 保留
    return encryptSecret(dto.secret); // 传空对象 → 清空；非空 → 覆盖
  }

  private async getOrThrow(id: string): Promise<Connector> {
    const connector = await this.prisma.connector.findUnique({ where: { id } });
    if (!connector) {
      throw new NotFoundException({
        code: 'CONNECTOR_NOT_FOUND',
        message: `连接器不存在：${id}`,
      });
    }
    return connector;
  }

  /** 禁用租户不可新建连接器（验收标准 3）。 */
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
        message: '该租户已禁用，不可新建连接器',
      });
    }
  }

  /** 校验用户对指定租户有访问权（非超管须为其绑定租户）。 */
  async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的连接器访问权限',
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

  private readConfig(connector: Connector): ConnectorConfig {
    const raw = connector.config;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const c = raw as Partial<ConnectorConfig>;
      return {
        properties: c.properties ?? {},
        allowedToolScopes: c.allowedToolScopes ?? [],
        secretCipher: c.secretCipher ?? null,
      };
    }
    return { ...EMPTY_CONNECTOR_CONFIG };
  }

  /** 视图：脱敏 —— 不回传密文与凭证明文，仅回显凭证字段名掩码与 hasSecret。 */
  private toView(connector: Connector) {
    const config = this.readConfig(connector);
    const secret = decryptSecret(config.secretCipher);
    return {
      id: connector.id,
      tenantId: connector.tenantId,
      name: connector.name,
      type: connector.type,
      target: connector.target,
      authType: connector.authType,
      timeoutMs: connector.timeoutMs,
      status: connector.status,
      description: connector.description,
      properties: config.properties,
      allowedToolScopes: config.allowedToolScopes,
      hasSecret: secret !== null,
      secretMask: maskSecret(secret),
      lastTestStatus: connector.lastTestStatus,
      lastTestLatencyMs: connector.lastTestLatencyMs,
      lastTestMessage: connector.lastTestMessage,
      lastTestedAt: connector.lastTestedAt,
      createdAt: connector.createdAt,
      updatedAt: connector.updatedAt,
    };
  }
}
