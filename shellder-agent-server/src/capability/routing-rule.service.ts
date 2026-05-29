import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoutingRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateRoutingRuleDto } from './dto/create-routing-rule.dto';
import { QueryRoutingRuleDto } from './dto/query-routing-rule.dto';
import { UpdateRoutingRuleDto } from './dto/update-routing-rule.dto';

/**
 * 路由规则服务（功能清单 §1.4）。
 *
 * 配置能力与 Tool / 策略规则的关联，定义每类能力可调用范围。
 * 路由规则从属于能力（capabilityId），能力删除时级联删除。
 */
@Injectable()
export class RoutingRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async create(user: AuthUser, dto: CreateRoutingRuleDto) {
    await this.assertTenantAccess(user, dto.tenantId);

    const capability = await this.prisma.capability.findUnique({ where: { id: dto.capabilityId } });
    if (!capability) {
      throw new NotFoundException({ code: 'CAPABILITY_NOT_FOUND', message: `能力不存在：${dto.capabilityId}` });
    }
    if (capability.tenantId !== dto.tenantId) {
      throw new BadRequestException({ code: 'CAPABILITY_TENANT_MISMATCH', message: '路由规则与能力不属于同一租户' });
    }

    return this.prisma.routingRule.create({
      data: {
        tenantId: dto.tenantId,
        capabilityId: dto.capabilityId,
        name: dto.name,
        description: dto.description ?? null,
        conditions: dto.conditions as Prisma.InputJsonValue,
        toolIds: (dto.toolIds ?? []) as Prisma.InputJsonValue,
        priority: dto.priority ?? 100,
        needConfirmation: dto.needConfirmation ?? false,
      },
      include: { capability: { select: { id: true, name: true, type: true } } },
    });
  }

  async findMany(user: AuthUser, query: QueryRoutingRuleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.RoutingRuleWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.capabilityId) where.capabilityId = query.capabilityId;
    if (query.status) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { description: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.routingRule.count({ where }),
      this.prisma.routingRule.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { capability: { select: { id: true, name: true, type: true } } },
      }),
    ]);

    return { items: rows, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const rule = await this.getOrThrow(id);
    await this.assertTenantAccess(user, rule.tenantId);
    return this.prisma.routingRule.findUnique({
      where: { id },
      include: { capability: { select: { id: true, name: true, type: true } } },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateRoutingRuleDto) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    if (dto.capabilityId) {
      const cap = await this.prisma.capability.findUnique({ where: { id: dto.capabilityId } });
      if (!cap) {
        throw new NotFoundException({ code: 'CAPABILITY_NOT_FOUND', message: `能力不存在：${dto.capabilityId}` });
      }
      if (cap.tenantId !== existing.tenantId) {
        throw new BadRequestException({ code: 'CAPABILITY_TENANT_MISMATCH', message: '路由规则与能力不属于同一租户' });
      }
    }

    const data: Prisma.RoutingRuleUpdateInput = {};
    if (dto.capabilityId !== undefined) data.capability = { connect: { id: dto.capabilityId } };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.conditions !== undefined) data.conditions = dto.conditions as Prisma.InputJsonValue;
    if (dto.toolIds !== undefined) data.toolIds = dto.toolIds as Prisma.InputJsonValue;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.needConfirmation !== undefined) data.needConfirmation = dto.needConfirmation;

    return this.prisma.routingRule.update({
      where: { id },
      data,
      include: { capability: { select: { id: true, name: true, type: true } } },
    });
  }

  async updateStatus(user: AuthUser, id: string, status: RoutingRule['status']) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    return this.prisma.routingRule.update({
      where: { id },
      data: { status },
      include: { capability: { select: { id: true, name: true, type: true } } },
    });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    await this.prisma.routingRule.delete({ where: { id } });
    return { id };
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private async getOrThrow(id: string): Promise<RoutingRule> {
    const rule = await this.prisma.routingRule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException({ code: 'ROUTING_RULE_NOT_FOUND', message: `路由规则不存在：${id}` });
    }
    return rule;
  }

  private async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({ code: 'TENANT_FORBIDDEN', message: '无该租户的路由规则访问权限' });
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
}
