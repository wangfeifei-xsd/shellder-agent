import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Tenant, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import {
  DEFAULT_TENANT_ISOLATION,
  TenantConfigDto,
  TenantIsolationDto,
} from './dto/tenant-config.dto';
import { UpdateIsolationDto } from './dto/update-isolation.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

/** tenant.config 的内部归一化结构 */
interface NormalizedTenantConfig {
  capabilities: string[];
  limits: { maxSessions: number; maxTasks: number };
  isolation: Required<TenantIsolationDto>;
}

const DEFAULT_CONFIG: NormalizedTenantConfig = {
  capabilities: [],
  limits: { maxSessions: 0, maxTasks: 0 },
  isolation: { ...DEFAULT_TENANT_ISOLATION },
};

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    await this.ensureCodeAvailable(dto.code);

    const config = this.mergeConfig(DEFAULT_CONFIG, dto.config);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        code: dto.code,
        status: dto.status ?? TenantStatus.enabled,
        adminUserId: dto.adminUserId ?? null,
        externalTenantId: dto.externalTenantId ?? null,
        remark: dto.remark ?? null,
        config: config as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toView(tenant);
  }

  async findMany(query: QueryTenantDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.TenantWhereInput = {};
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { code: { contains: query.keyword } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.capability) {
      where.config = {
        path: '$.capabilities',
        array_contains: query.capability,
      } as Prisma.TenantWhereInput['config'];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((t) => this.toView(t)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const tenant = await this.getOrThrow(id);
    return {
      ...this.toView(tenant),
      stats: await this.getStats(tenant.id),
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    const existing = await this.getOrThrow(id);

    if (dto.code && dto.code !== existing.code) {
      await this.ensureCodeAvailable(dto.code);
    }

    const data: Prisma.TenantUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.adminUserId !== undefined) data.adminUserId = dto.adminUserId || null;
    if (dto.externalTenantId !== undefined) {
      data.externalTenantId = dto.externalTenantId || null;
    }
    if (dto.remark !== undefined) data.remark = dto.remark || null;
    if (dto.config !== undefined) {
      const merged = this.mergeConfig(this.readConfig(existing), dto.config);
      data.config = merged as unknown as Prisma.InputJsonValue;
    }

    const tenant = await this.prisma.tenant.update({ where: { id }, data });
    return this.toView(tenant);
  }

  async updateStatus(id: string, status: TenantStatus) {
    await this.getOrThrow(id);
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { status },
    });
    return this.toView(tenant);
  }

  async getIsolation(id: string) {
    const tenant = await this.getOrThrow(id);
    return this.readConfig(tenant).isolation;
  }

  async updateIsolation(id: string, dto: UpdateIsolationDto) {
    const existing = await this.getOrThrow(id);
    const current = this.readConfig(existing);
    const isolation: Required<TenantIsolationDto> = {
      ...current.isolation,
      ...this.stripUndefined(dto),
    };
    const config: NormalizedTenantConfig = { ...current, isolation };

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { config: config as unknown as Prisma.InputJsonValue },
    });
    return this.readConfig(tenant).isolation;
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private async ensureCodeAvailable(code: string) {
    const exists = await this.prisma.tenant.findUnique({ where: { code } });
    if (exists) {
      throw new ConflictException({
        code: 'TENANT_CODE_CONFLICT',
        message: `租户编码已存在：${code}`,
      });
    }
  }

  private async getOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `租户不存在：${id}`,
      });
    }
    return tenant;
  }

  /** 统计：用户/会话/任务/工具/连接器数；相关模块未就绪时统一返回 0 */
  private async getStats(_tenantId: string) {
    return {
      userCount: 0,
      sessionCount: 0,
      taskCount: 0,
      toolCount: 0,
      connectorCount: 0,
    };
  }

  private readConfig(tenant: Tenant): NormalizedTenantConfig {
    const raw = (tenant.config ?? {}) as Partial<NormalizedTenantConfig>;
    return {
      capabilities: raw.capabilities ?? [...DEFAULT_CONFIG.capabilities],
      limits: { ...DEFAULT_CONFIG.limits, ...(raw.limits ?? {}) },
      isolation: { ...DEFAULT_CONFIG.isolation, ...(raw.isolation ?? {}) },
    };
  }

  private mergeConfig(
    base: NormalizedTenantConfig,
    patch?: TenantConfigDto,
  ): NormalizedTenantConfig {
    if (!patch) return { ...base };
    return {
      capabilities: patch.capabilities ?? base.capabilities,
      limits: { ...base.limits, ...this.stripUndefined(patch.limits ?? {}) },
      isolation: {
        ...base.isolation,
        ...this.stripUndefined(patch.isolation ?? {}),
      },
    };
  }

  private stripUndefined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
  }

  private toView(tenant: Tenant) {
    const config = this.readConfig(tenant);
    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      status: tenant.status,
      externalTenantId: tenant.externalTenantId,
      adminUserId: tenant.adminUserId,
      remark: tenant.remark,
      capabilities: config.capabilities,
      limits: config.limits,
      isolation: config.isolation,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }
}
