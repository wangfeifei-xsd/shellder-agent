import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Rule, RuleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../../auth/permission.service';
import { AuthUser } from '../../auth/jwt.types';
import { CreateRuleDto } from './dto/create-rule.dto';
import { QueryRuleDto } from './dto/query-rule.dto';
import { QueryRuleHitDto } from './dto/query-rule-hit.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

/**
 * 规则配置与命中记录服务。
 * 跨租户隔离（验收标准 3）：
 * - 超级管理员：可见 / 可维护全部，可选 ?tenantId 过滤。
 * - 非超管：仅可见 / 可维护其绑定租户（user.tenantIds）内规则与命中。
 */
@Injectable()
export class RuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async create(user: AuthUser, dto: CreateRuleDto) {
    await this.assertTenantAccess(user, dto.tenantId);
    await this.ensureTenantExists(dto.tenantId);

    const rule = await this.prisma.rule.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        type: dto.type,
        action: dto.action,
        priority: dto.priority ?? 100,
        description: dto.description ?? null,
        conditions: (dto.conditions ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toView(rule);
  }

  async findMany(user: AuthUser, query: QueryRuleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.RuleWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.type) where.type = query.type;
    if (query.action) where.action = query.action;
    if (query.status) where.status = query.status;
    if (query.keyword) where.name = { contains: query.keyword };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.rule.count({ where }),
      this.prisma.rule.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toView(r)), total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const rule = await this.getOrThrow(id);
    await this.assertTenantAccess(user, rule.tenantId);
    return this.toView(rule);
  }

  async update(user: AuthUser, id: string, dto: UpdateRuleDto) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    const data: Prisma.RuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.action !== undefined) data.action = dto.action;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.conditions !== undefined) {
      data.conditions = (dto.conditions ?? {}) as unknown as Prisma.InputJsonValue;
    }

    const rule = await this.prisma.rule.update({ where: { id }, data });
    return this.toView(rule);
  }

  async updateStatus(user: AuthUser, id: string, status: RuleStatus) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    const rule = await this.prisma.rule.update({ where: { id }, data: { status } });
    return this.toView(rule);
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    // rule_hit.rule_id 外键 ON DELETE SET NULL：命中历史保留，仅断开关联
    await this.prisma.rule.delete({ where: { id } });
    return { id };
  }

  async findHits(user: AuthUser, query: QueryRuleHitDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.RuleHitWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.ruleId) where.ruleId = query.ruleId;
    if (query.ruleType) where.ruleType = query.ruleType;
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.taskId) where.taskId = query.taskId;
    if (query.keyword) {
      where.OR = [
        { ruleName: { contains: query.keyword } },
        { toolName: { contains: query.keyword } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.ruleHit.count({ where }),
      this.prisma.ruleHit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items, total, page, pageSize };
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private async getOrThrow(id: string): Promise<Rule> {
    const rule = await this.prisma.rule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException({
        code: 'RULE_NOT_FOUND',
        message: `规则不存在：${id}`,
      });
    }
    return rule;
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `租户不存在：${tenantId}`,
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
        message: '无该租户的规则访问权限',
      });
    }
  }

  /**
   * 计算租户过滤值；非超管强制限定在其绑定租户内。
   * 超管未指定 tenantId 时返回 undefined（不限定）。
   */
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

  private toView(rule: Rule) {
    return {
      id: rule.id,
      tenantId: rule.tenantId,
      name: rule.name,
      type: rule.type,
      conditions: (rule.conditions ?? {}) as Record<string, unknown>,
      action: rule.action,
      priority: rule.priority,
      status: rule.status,
      description: rule.description,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
