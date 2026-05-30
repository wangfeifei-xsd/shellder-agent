import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Approval, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { QueryApprovalDto } from './dto/query-approval.dto';
import { ReviewAction } from './dto/review-approval.dto';
import { NotificationQueueService } from '../job-queue/notification-queue.service';
import { ApprovalRuntimeService } from './approval-runtime.service';
import { toApprovalView } from './approval.view';

const DEFAULT_EXPIRE_HOURS = 24;

/**
 * 审批中心服务（功能清单 §1.8 / 执行计划 §5）。
 *
 * - 创建审批记录（Agent Runtime 确认中断时调用）
 * - 待确认列表（按租户、动作类型、发起人、时间筛选）
 * - 审批详情（操作背景、原始请求、待执行动作、风险等级、影响范围）
 * - 确认执行 / 驳回 / 审批意见
 * - 审批记录（已审批、已驳回、已超时）
 *
 * 跨租户隔离：超管可见全部，非超管仅可见其绑定租户。
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    @Inject(forwardRef(() => ApprovalRuntimeService))
    private readonly approvalRuntime: ApprovalRuntimeService,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  /**
   * 创建审批记录（供 Agent Runtime 内部调用）。
   */
  async create(dto: CreateApprovalDto): Promise<Approval> {
    await this.ensureTenantExists(dto.tenantId);

    const expiredAt = new Date();
    expiredAt.setHours(expiredAt.getHours() + DEFAULT_EXPIRE_HOURS);

    const approval = await this.prisma.approval.create({
      data: {
        tenantId: dto.tenantId,
        sessionId: dto.sessionId ?? null,
        taskId: dto.taskId ?? null,
        messageId: dto.messageId ?? null,
        initiatorId: dto.initiatorId ?? null,
        initiatorName: dto.initiatorName ?? null,
        actionType: dto.actionType,
        actionSummary: dto.actionSummary ?? null,
        riskLevel: dto.riskLevel ?? 'high',
        impactScope: dto.impactScope ?? null,
        toolIds: dto.toolIds
          ? (dto.toolIds as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        requestContext: dto.requestContext
          ? (dto.requestContext as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        expiredAt,
      },
    });

    await this.notificationQueue.enqueueApprovalPending(
      dto.tenantId,
      approval.id,
      {
        actionType: approval.actionType,
        actionSummary: approval.actionSummary ?? '',
        initiatorName: approval.initiatorName ?? '',
        approvalId: approval.id,
      },
      dto.taskId ?? undefined,
    );

    return approval;
  }

  /**
   * 待确认列表 / 审批记录列表（按查询条件筛选）。
   */
  async findMany(user: AuthUser, query: QueryApprovalDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ApprovalWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.status) where.status = query.status;
    if (query.actionType) where.actionType = { contains: query.actionType };
    if (query.riskLevel) where.riskLevel = query.riskLevel;
    if (query.initiatorId) where.initiatorId = query.initiatorId;
    if (query.reviewerId) where.reviewerId = query.reviewerId;
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.keyword) {
      where.OR = [
        { actionType: { contains: query.keyword } },
        { actionSummary: { contains: query.keyword } },
        { initiatorName: { contains: query.keyword } },
      ];
    }
    if (query.startTime || query.endTime) {
      where.createdAt = {};
      if (query.startTime) where.createdAt.gte = new Date(query.startTime);
      if (query.endTime) where.createdAt.lte = new Date(query.endTime);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.approval.count({ where }),
      this.prisma.approval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toView(r)), total, page, pageSize };
  }

  /**
   * 审批详情。
   */
  async findOne(user: AuthUser, id: string) {
    const approval = await this.getOrThrow(id);
    await this.assertTenantAccess(user, approval.tenantId);
    return this.toView(approval);
  }

  /**
   * 确认执行 / 驳回（委托 ApprovalRuntimeService，含 Runtime 断点恢复）。
   */
  async review(
    user: AuthUser,
    id: string,
    action: ReviewAction,
    opinion?: string,
  ) {
    const result = await this.approvalRuntime.reviewByUser(user, id, action, opinion);
    return result.approval;
  }

  /**
   * 批量超时处理（供 job-worker 定时任务调用）。
   */
  async markExpiredAsTimeout(): Promise<number> {
    return this.approvalRuntime.markExpiredAsTimeout();
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private async getOrThrow(id: string): Promise<Approval> {
    const approval = await this.prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      throw new NotFoundException({
        code: 'APPROVAL_NOT_FOUND',
        message: `审批记录不存在：${id}`,
      });
    }
    return approval;
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `租户不存在：${tenantId}`,
      });
    }
  }

  async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的审批访问权限',
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

  private toView(approval: Approval) {
    return toApprovalView(approval);
  }
}
