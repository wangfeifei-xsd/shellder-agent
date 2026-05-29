import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import {
  QueryExternalCallDto,
  QueryRiskActionDto,
  QueryToolCallDto,
  QueryUserActionDto,
} from './dto/query-audit.dto';

interface Paged {
  page?: number;
  pageSize?: number;
  tenantId?: string;
}

/**
 * 审计查询服务：分页 + 筛选 + 租户隔离（验收标准 4）。
 * - 超级管理员：可见全部，可选 ?tenantId 过滤。
 * - 非超管：仅可见绑定租户（user.tenantIds）内记录；平台级 tenant_id=NULL 记录不下发。
 */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async findToolCalls(user: AuthUser, query: QueryToolCallDto) {
    const where: Prisma.ToolCallAuditWhereInput = {};
    where.tenantId = await this.resolveTenantFilter(user, query.tenantId);
    if (query.toolName) where.toolName = query.toolName;
    if (query.callerUserId) where.callerUserId = query.callerUserId;
    if (query.status) where.status = query.status;
    if (query.keyword) where.toolName = { contains: query.keyword };

    const { page, pageSize, skip, take } = this.pageOf(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.toolCallAudit.count({ where }),
      this.prisma.toolCallAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async findUserActions(user: AuthUser, query: QueryUserActionDto) {
    const where: Prisma.UserActionAuditWhereInput = {};
    where.tenantId = await this.resolveTenantFilter(user, query.tenantId);
    if (query.action) where.action = query.action;
    if (query.module) where.module = query.module;
    if (query.operatorUserId) where.operatorUserId = query.operatorUserId;
    if (query.keyword) {
      where.OR = [
        { action: { contains: query.keyword } },
        { summary: { contains: query.keyword } },
      ];
    }

    const { page, pageSize, skip, take } = this.pageOf(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.userActionAudit.count({ where }),
      this.prisma.userActionAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async findExternalCalls(user: AuthUser, query: QueryExternalCallDto) {
    const where: Prisma.ExternalCallAuditWhereInput = {};
    where.tenantId = await this.resolveTenantFilter(user, query.tenantId);
    if (query.status) where.status = query.status;
    if (query.keyword) where.target = { contains: query.keyword };

    const { page, pageSize, skip, take } = this.pageOf(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.externalCallAudit.count({ where }),
      this.prisma.externalCallAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * 风险动作审计：聚合只读视图（执行计划 §3.4 / §5.2）。
   * V1 聚合自 tool_call_audit(high_risk=true)；14-审批中心 就绪后再 JOIN approval。
   * 无高风险工具调用且无审批数据时返回空态（验收标准 3）。
   */
  async findRiskActions(user: AuthUser, query: QueryRiskActionDto) {
    const where: Prisma.ToolCallAuditWhereInput = { highRisk: true };
    where.tenantId = await this.resolveTenantFilter(user, query.tenantId);
    if (query.keyword) where.toolName = { contains: query.keyword };

    const { page, pageSize, skip, take } = this.pageOf(query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.toolCallAudit.count({ where }),
      this.prisma.toolCallAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      source: 'tool_call' as const,
      tenantId: row.tenantId,
      action: row.toolName,
      operator: row.callerName,
      status: row.status,
      sessionId: row.sessionId,
      taskId: row.taskId,
      summary: row.requestSummary,
      createdAt: row.createdAt,
    }));

    return { items, total, page, pageSize };
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private pageOf(query: Paged) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
  }

  /**
   * 计算租户过滤值；非超管强制限定在其绑定租户内。
   * 返回 undefined 表示不限定（仅超级管理员未指定 tenantId 时）。
   */
  private async resolveTenantFilter(
    user: AuthUser,
    requestedTenantId?: string,
  ): Promise<string | Prisma.StringNullableFilter | undefined> {
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
