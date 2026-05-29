import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Approval, ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { QueryApprovalDto } from './dto/query-approval.dto';
import { ReviewAction } from './dto/review-approval.dto';

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
  ) {}

  /**
   * 创建审批记录（供 Agent Runtime 内部调用）。
   */
  async create(dto: CreateApprovalDto): Promise<Approval> {
    await this.ensureTenantExists(dto.tenantId);

    const expiredAt = new Date();
    expiredAt.setHours(expiredAt.getHours() + DEFAULT_EXPIRE_HOURS);

    return this.prisma.approval.create({
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
   * 确认执行 / 驳回。
   * 确认后恢复 session/task 状态；驳回后标记失败并写入驳回消息。
   */
  async review(
    user: AuthUser,
    id: string,
    action: ReviewAction,
    opinion?: string,
  ) {
    const approval = await this.getOrThrow(id);
    await this.assertTenantAccess(user, approval.tenantId);

    if (approval.status !== 'pending') {
      throw new BadRequestException({
        code: 'APPROVAL_NOT_PENDING',
        message: `审批记录不在待确认状态，当前状态：${approval.status}`,
      });
    }

    const now = new Date();
    const newStatus: ApprovalStatus =
      action === ReviewAction.approve ? 'approved' : 'rejected';

    const updated = await this.prisma.approval.update({
      where: { id },
      data: {
        status: newStatus,
        reviewerId: user.id,
        reviewerName: user.username ?? null,
        opinion: opinion ?? null,
        reviewedAt: now,
      },
    });

    if (action === ReviewAction.approve) {
      await this.onApproved(approval);
    } else {
      await this.onRejected(approval, opinion);
    }

    return this.toView(updated);
  }

  /**
   * 批量超时处理（供 job-worker 定时任务调用）。
   */
  async markExpiredAsTimeout(): Promise<number> {
    const result = await this.prisma.approval.updateMany({
      where: {
        status: 'pending',
        expiredAt: { lte: new Date() },
      },
      data: { status: 'timeout' },
    });

    if (result.count > 0) {
      this.logger.log(`已标记 ${result.count} 条审批记录为超时`);
    }

    return result.count;
  }

  // ── 确认/驳回后联动 ────────────────────────────────────────

  /**
   * 确认后：恢复 session 状态为 active，以便后续消息可继续发送。
   */
  private async onApproved(approval: Approval) {
    try {
      if (approval.sessionId) {
        await this.prisma.session.update({
          where: { id: approval.sessionId },
          data: { status: 'active' },
        });
      }
      if (approval.taskId) {
        await this.prisma.task.update({
          where: { id: approval.taskId },
          data: { status: 'running' },
        });
      }

      if (approval.sessionId) {
        const lastMsg = await this.prisma.message.findFirst({
          where: { sessionId: approval.sessionId },
          orderBy: { seq: 'desc' },
          select: { seq: true },
        });
        await this.prisma.message.create({
          data: {
            sessionId: approval.sessionId,
            type: 'confirmation',
            role: 'system',
            content: {
              type: 'confirm_approved',
              approvalId: approval.id,
              actionType: approval.actionType,
            } as unknown as Prisma.InputJsonValue,
            seq: (lastMsg?.seq ?? 0) + 1,
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`确认后联动失败 approval=${approval.id}: ${msg}`);
    }
  }

  /**
   * 驳回后：session 状态 failed / task 状态 failed，写入驳回消息。
   */
  private async onRejected(approval: Approval, opinion?: string) {
    try {
      if (approval.sessionId) {
        await this.prisma.session.update({
          where: { id: approval.sessionId },
          data: { status: 'failed' },
        });
      }
      if (approval.taskId) {
        await this.prisma.task.update({
          where: { id: approval.taskId },
          data: {
            status: 'failed',
            failReason: `审批驳回：${opinion ?? '无意见'}`,
          },
        });
      }

      if (approval.sessionId) {
        const lastMsg = await this.prisma.message.findFirst({
          where: { sessionId: approval.sessionId },
          orderBy: { seq: 'desc' },
          select: { seq: true },
        });
        await this.prisma.message.create({
          data: {
            sessionId: approval.sessionId,
            type: 'confirmation',
            role: 'system',
            content: {
              type: 'confirm_rejected',
              approvalId: approval.id,
              actionType: approval.actionType,
              reason: opinion ?? '审批被驳回',
            } as unknown as Prisma.InputJsonValue,
            seq: (lastMsg?.seq ?? 0) + 1,
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`驳回后联动失败 approval=${approval.id}: ${msg}`);
    }
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
    return {
      id: approval.id,
      tenantId: approval.tenantId,
      sessionId: approval.sessionId,
      taskId: approval.taskId,
      messageId: approval.messageId,
      initiatorId: approval.initiatorId,
      initiatorName: approval.initiatorName,
      actionType: approval.actionType,
      actionSummary: approval.actionSummary,
      riskLevel: approval.riskLevel,
      impactScope: approval.impactScope,
      toolIds: (approval.toolIds ?? []) as string[],
      requestContext: (approval.requestContext ?? {}) as Record<string, unknown>,
      status: approval.status,
      reviewerId: approval.reviewerId,
      reviewerName: approval.reviewerName,
      opinion: approval.opinion,
      reviewedAt: approval.reviewedAt,
      expiredAt: approval.expiredAt,
      createdAt: approval.createdAt,
      updatedAt: approval.updatedAt,
    };
  }
}
