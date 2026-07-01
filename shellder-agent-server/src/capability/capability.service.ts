import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Capability, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { AuthUser } from '../auth/jwt.types';
import { DEFAULT_TENANT_CAPABILITIES } from './capability-defaults';
import { CreateCapabilityDto } from './dto/create-capability.dto';
import { QueryCapabilityDto } from './dto/query-capability.dto';
import { UpdateCapabilityDto } from './dto/update-capability.dto';
import { TENANT_CAPABILITIES } from '../tenant/dto/tenant-config.dto';

/**
 * 能力目录服务（功能清单 §1.4 / 架构 Capability Routing）。
 *
 * 维护平台能力清单：描述、适用系统、依赖工具、权限要求。
 * 按租户隔离（实施规格 §1.4）。
 * 导出供路由引擎、Agent Runtime 调用。
 */
@Injectable()
export class CapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async create(user: AuthUser, dto: CreateCapabilityDto) {
    await this.tenantScope.assertAccess(user, dto.tenantId, { resource: '能力' });
    await this.tenantScope.assertEnabled(dto.tenantId, { action: '新建能力' });
    this.assertCapabilityInTenantConfig(dto.tenantId, dto.type);

    try {
      return await this.prisma.capability.create({
        data: {
          tenantId: dto.tenantId,
          type: dto.type,
          name: dto.name,
          description: dto.description ?? null,
          applicableSystem: dto.applicableSystem ?? null,
          dependentTools: (dto.dependentTools ?? []) as Prisma.InputJsonValue,
          permissionRequirements: (dto.permissionRequirements ?? []) as Prisma.InputJsonValue,
          priority: dto.priority ?? 100,
        },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async findMany(user: AuthUser, query: QueryCapabilityDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const tenantFilter = await this.tenantScope.resolveFilter(user, query.tenantId);
    if (typeof tenantFilter === 'string') {
      await this.ensureDefaultCapabilities(tenantFilter);
    }

    const where: Prisma.CapabilityWhereInput = {
      tenantId: tenantFilter,
    };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { description: { contains: query.keyword } },
        { applicableSystem: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.capability.count({ where }),
      this.prisma.capability.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { routingRules: { where: { status: 'enabled' }, select: { id: true, name: true } } },
      }),
    ]);

    return { items: rows, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const cap = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, cap.tenantId, { resource: '能力' });

    const rules = await this.prisma.routingRule.findMany({
      where: { capabilityId: id },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });

    return { ...cap, routingRules: rules };
  }

  async update(user: AuthUser, id: string, dto: UpdateCapabilityDto) {
    const existing = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, existing.tenantId, { resource: '能力' });

    const data: Prisma.CapabilityUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.applicableSystem !== undefined) data.applicableSystem = dto.applicableSystem || null;
    if (dto.dependentTools !== undefined) data.dependentTools = dto.dependentTools as Prisma.InputJsonValue;
    if (dto.permissionRequirements !== undefined) data.permissionRequirements = dto.permissionRequirements as Prisma.InputJsonValue;
    if (dto.priority !== undefined) data.priority = dto.priority;

    try {
      return await this.prisma.capability.update({ where: { id }, data });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async updateStatus(user: AuthUser, id: string, status: Capability['status']) {
    const existing = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, existing.tenantId, { resource: '能力' });
    return this.prisma.capability.update({ where: { id }, data: { status } });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, existing.tenantId, { resource: '能力' });
    await this.prisma.capability.delete({ where: { id } });
    return { id };
  }

  /**
   * 租户下无任何能力记录时，按 tenant.config.capabilities 自动创建四类基础能力。
   * 路由规则、路由引擎、能力目录列表均依赖 capability 表，不可仅配置 tenant.config。
   */
  async ensureDefaultCapabilities(tenantId: string): Promise<void> {
    const count = await this.prisma.capability.count({ where: { tenantId } });
    if (count > 0) return;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.status === 'disabled') return;

    const config = tenant.config as { capabilities?: string[] } | null;
    const allowed =
      config?.capabilities?.length
        ? config.capabilities.filter((t): t is (typeof TENANT_CAPABILITIES)[number] =>
            (TENANT_CAPABILITIES as readonly string[]).includes(t),
          )
        : [...TENANT_CAPABILITIES];

    if (allowed.length === 0) return;

    const allowedSet = new Set(allowed);
    for (const def of DEFAULT_TENANT_CAPABILITIES) {
      if (!allowedSet.has(def.type)) continue;
      try {
        await this.prisma.capability.create({
          data: {
            tenantId,
            type: def.type,
            name: def.name,
            description: def.description,
            applicableSystem: def.applicableSystem,
            dependentTools: [] as Prisma.InputJsonValue,
            permissionRequirements: [] as Prisma.InputJsonValue,
            priority: def.priority,
            status: 'enabled',
          },
        });
      } catch (err) {
        if (
          !(
            err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
          )
        ) {
          throw err;
        }
      }
    }
  }

  /** 获取租户的启用能力列表（供路由引擎调用） */
  async getEnabledByTenant(tenantId: string) {
    await this.ensureDefaultCapabilities(tenantId);
    return this.prisma.capability.findMany({
      where: { tenantId, status: 'enabled' },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { routingRules: { where: { status: 'enabled' }, orderBy: [{ priority: 'asc' }] } },
    });
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private async getOrThrow(id: string): Promise<Capability> {
    const cap = await this.prisma.capability.findUnique({ where: { id } });
    if (!cap) {
      throw new NotFoundException({ code: 'CAPABILITY_NOT_FOUND', message: `能力不存在：${id}` });
    }
    return cap;
  }

  /** 验证租户 config.capabilities 中是否开通了该类型能力（验收标准 2） */
  private async assertCapabilityInTenantConfig(tenantId: string, type: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;
    const config = tenant.config as { capabilities?: string[] } | null;
    const allowed = config?.capabilities ?? [];
    if (allowed.length === 0) {
      throw new BadRequestException({
        code: 'TENANT_CAPABILITIES_REQUIRED',
        message: '该租户未配置开通能力范围，请先在租户管理中选择至少一种能力',
      });
    }
    if (!allowed.includes(type)) {
      throw new BadRequestException({
        code: 'CAPABILITY_TYPE_NOT_ALLOWED',
        message: `该租户未开通 ${type} 类型能力，已开通：${allowed.join(', ')}`,
      });
    }
  }

  private mapUniqueError(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new BadRequestException({
        code: 'CAPABILITY_NAME_DUPLICATED',
        message: '同租户下已存在同名能力',
      });
    }
    return err;
  }
}
