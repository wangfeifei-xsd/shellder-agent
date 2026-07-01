import {
  BadRequestException,
  ConflictException,
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
import { AuthUser } from '../auth/jwt.types';
import { TenantScopeService } from '../tenant/tenant-scope.service';
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
import { resolveDbEndpoint } from './db-connection.util';

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
    private readonly tenantScope: TenantScopeService,
    private readonly audit: AuditService,
    private readonly connectivity: ConnectivityTestService,
  ) {}

  async create(user: AuthUser, dto: CreateConnectorDto) {
    await this.tenantScope.assertAccess(user, dto.tenantId, { resource: '连接器' });
    await this.tenantScope.assertEnabled(dto.tenantId, { action: '新建连接器' });
    this.assertDbReadonlyConfig(dto.type, dto.target, dto.properties ?? {});
    this.assertDbReadonlyAuth(dto.type, dto.authType, dto.secret, { isCreate: true });
    await this.assertDbEndpointUnique(
      dto.tenantId,
      dto.type,
      dto.target,
      dto.properties ?? {},
    );

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
        authType: dto.type === 'db_readonly' ? 'basic' : (dto.authType ?? 'none'),
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
      tenantId: await this.tenantScope.resolveFilter(user, query.tenantId),
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
    await this.tenantScope.assertAccess(user, connector.tenantId, { resource: '连接器' });

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
    await this.tenantScope.assertAccess(user, existing.tenantId, { resource: '连接器' });

    const current = this.readConfig(existing);
    const nextType = dto.type ?? existing.type;
    const nextTarget = dto.target ?? existing.target;
    const nextProperties = dto.properties ?? current.properties;
    this.assertDbReadonlyConfig(nextType, nextTarget, nextProperties);
    const existingSecret = decryptSecret(current.secretCipher);
    const existingHasSecret = existingSecret !== null;
    const mergedSecret = this.mergeSecretForUpdate(dto, current);
    this.assertDbReadonlyAuth(nextType, dto.authType ?? existing.authType, mergedSecret, {
      isCreate: false,
      existingHasSecret,
      clearSecret: dto.clearSecret,
    });
    await this.assertDbEndpointUnique(
      existing.tenantId,
      nextType,
      nextTarget,
      nextProperties,
      id,
    );
    const config: ConnectorConfig = {
      properties: dto.properties ?? current.properties,
      allowedToolScopes: dto.allowedToolScopes ?? current.allowedToolScopes,
      secretCipher: this.resolveSecretCipher(dto, current, mergedSecret),
    };

    const data: Prisma.ConnectorUpdateInput = {
      config: config as unknown as Prisma.InputJsonValue,
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.target !== undefined) data.target = dto.target;
    if (nextType === 'db_readonly') {
      data.authType = 'basic';
    } else if (dto.authType !== undefined) {
      data.authType = dto.authType;
    }
    if (dto.timeoutMs !== undefined) data.timeoutMs = dto.timeoutMs;
    if (dto.description !== undefined) data.description = dto.description || null;

    const connector = await this.prisma.connector.update({ where: { id }, data });
    return this.toView(connector);
  }

  async updateStatus(user: AuthUser, id: string, status: ConnectorStatus) {
    const existing = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, existing.tenantId, { resource: '连接器' });
    const connector = await this.prisma.connector.update({
      where: { id },
      data: { status },
    });
    return this.toView(connector);
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, existing.tenantId, { resource: '连接器' });
    await this.prisma.connector.delete({ where: { id } });
    return { id };
  }

  /** 加载连接器并校验租户访问（供 SQL 测试等子能力复用）。 */
  async assertAccessible(user: AuthUser, id: string): Promise<Connector> {
    const connector = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, connector.tenantId, { resource: '连接器' });
    return connector;
  }

  /**
   * 连通性测试（验收标准 2）：执行测试 → 记入 04 外部接口审计 → 更新最近测试快照。
   */
  async test(user: AuthUser, id: string) {
    const connector = await this.assertAccessible(user, id);

    const result = await this.connectivity.test(connector);

    // 记入外部接口审计（架构 §5：外部调用必须记录）
    await this.audit.logExternalCall({
      tenantId: connector.tenantId,
      connectorId: connector.id,
      target: connector.target,
      method: connector.type === 'db_readonly' ? 'SQL' : 'GET',
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

  /** 更新时合并凭证：未传的字段保留库内原值（支持仅改用户名、口令留空不改）。 */
  private mergeSecretForUpdate(
    dto: UpdateConnectorDto,
    current: ConnectorConfig,
  ): Record<string, string> | undefined {
    if (dto.clearSecret) return {};
    if (dto.secret === undefined) return undefined;
    if (Object.keys(dto.secret).length === 0) return {};
    const existing = (decryptSecret(current.secretCipher) ?? {}) as Record<string, string>;
    const merged: Record<string, string> = { ...existing };
    if (dto.secret.username?.trim()) {
      merged.username = dto.secret.username.trim();
    }
    if (dto.secret.password) {
      merged.password = dto.secret.password;
    }
    if (dto.secret.token) {
      merged.token = dto.secret.token;
    }
    if (dto.secret.headerName) {
      merged.headerName = dto.secret.headerName;
    }
    if (dto.secret.apiKey) {
      merged.apiKey = dto.secret.apiKey;
    }
    for (const [key, value] of Object.entries(dto.secret)) {
      if (key.startsWith('header.')) {
        merged[key] = value;
      }
    }
    return merged;
  }

  private resolveSecretCipher(
    dto: UpdateConnectorDto,
    current: ConnectorConfig,
    mergedSecret?: Record<string, string> | undefined,
  ): string | null {
    if (dto.clearSecret) return null;
    if (dto.secret === undefined) return current.secretCipher; // 未传 → 保留
    if (mergedSecret !== undefined && Object.keys(mergedSecret).length === 0) {
      return null;
    }
    if (mergedSecret !== undefined) {
      return encryptSecret(mergedSecret);
    }
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

  /** 只读库必须使用 Basic 认证且具备用户名与口令（方案 §2.2） */
  private assertDbReadonlyAuth(
    type: Connector['type'],
    authType: string | undefined,
    secret: Record<string, string> | undefined,
    opts: { isCreate: boolean; existingHasSecret?: boolean; clearSecret?: boolean },
  ) {
    if (type !== 'db_readonly') return;

    if (authType && authType !== 'basic') {
      throw new BadRequestException({
        code: 'CONNECTOR_DB_AUTH_REQUIRED',
        message: '只读数据库连接器仅支持 Basic 认证（用户名 + 口令）',
      });
    }

    if (opts.clearSecret) {
      throw new BadRequestException({
        code: 'CONNECTOR_DB_AUTH_REQUIRED',
        message: '只读数据库连接器不可清空数据库凭证',
      });
    }

    const hasNewSecret =
      secret !== undefined && Object.keys(secret).length > 0;
    const username = hasNewSecret ? secret!.username?.trim() : '';
    const password = hasNewSecret ? secret!.password : undefined;

    if (opts.isCreate) {
      if (!username || !password) {
        throw new BadRequestException({
          code: 'CONNECTOR_DB_AUTH_REQUIRED',
          message: '只读数据库连接器须填写数据库用户名与口令',
        });
      }
      return;
    }

    if (hasNewSecret) {
      if (!username) {
        throw new BadRequestException({
          code: 'CONNECTOR_DB_AUTH_REQUIRED',
          message: '只读数据库连接器须填写数据库用户名',
        });
      }
      if (!password && !opts.existingHasSecret) {
        throw new BadRequestException({
          code: 'CONNECTOR_DB_AUTH_REQUIRED',
          message: '只读数据库连接器须填写数据库口令',
        });
      }
    } else if (!opts.existingHasSecret) {
      throw new BadRequestException({
        code: 'CONNECTOR_DB_AUTH_REQUIRED',
        message: '只读数据库连接器须配置数据库用户名与口令',
      });
    }
  }

  private assertDbReadonlyConfig(
    type: Connector['type'],
    target: string,
    properties: Record<string, unknown>,
  ) {
    if (type !== 'db_readonly') return;
    try {
      resolveDbEndpoint(target, properties);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException({
        code: 'CONNECTOR_DB_CONFIG_INVALID',
        message: err instanceof Error ? err.message : '只读库配置无效',
      });
    }
  }

  /** 同租户下 (host, port, database) 不可重复 */
  private async assertDbEndpointUnique(
    tenantId: string,
    type: Connector['type'],
    target: string,
    properties: Record<string, unknown>,
    excludeId?: string,
  ) {
    if (type !== 'db_readonly') return;
    const endpoint = resolveDbEndpoint(target, properties);
    const peers = await this.prisma.connector.findMany({
      where: {
        tenantId,
        type: 'db_readonly',
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    for (const peer of peers) {
      const peerConfig = this.readConfig(peer);
      try {
        const peerEp = resolveDbEndpoint(peer.target, peerConfig.properties);
        if (
          peerEp.host === endpoint.host &&
          peerEp.port === endpoint.port &&
          peerEp.database.toLowerCase() === endpoint.database.toLowerCase()
        ) {
          throw new ConflictException({
            code: 'CONNECTOR_DB_ENDPOINT_DUPLICATE',
            message: `同租户下已存在指向 ${endpoint.host}:${endpoint.port}/${endpoint.database} 的只读库连接器「${peer.name}」`,
          });
        }
      } catch (err) {
        if (err instanceof ConflictException) throw err;
        // 对端配置不完整则跳过比较
      }
    }
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

  /** 视图：口令不回明文；用户名可回显便于编辑；secretMask 供界面展示掩码。 */
  private toView(connector: Connector) {
    const config = this.readConfig(connector);
    const secret = decryptSecret(config.secretCipher);
    const username =
      secret && typeof secret.username === 'string' ? secret.username : null;
    const passwordFromProps =
      typeof config.properties.username === 'string'
        ? config.properties.username
        : null;
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
      credentialHints: secret
        ? {
            username: username ?? passwordFromProps,
            passwordConfigured: !!secret.password,
          }
        : passwordFromProps
          ? { username: passwordFromProps, passwordConfigured: false }
          : null,
      lastTestStatus: connector.lastTestStatus,
      lastTestLatencyMs: connector.lastTestLatencyMs,
      lastTestMessage: connector.lastTestMessage,
      lastTestedAt: connector.lastTestedAt,
      createdAt: connector.createdAt,
      updatedAt: connector.updatedAt,
    };
  }
}
