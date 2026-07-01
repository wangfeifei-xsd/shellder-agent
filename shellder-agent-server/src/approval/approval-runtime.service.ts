import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Approval, ApprovalStatus, AuditStatus } from '@prisma/client';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { TaskQueueService } from '../task/task-queue.service';
import {
  ConfirmationAction,
  ConfirmationActor,
  SubmitConfirmationInput,
} from './approval-runtime.types';
import { ReviewAction } from './dto/review-approval.dto';
import { toApprovalView } from './approval.view';

/**
 * 审批与 Agent Runtime 断点恢复（执行计划 14 §4 / 12 §4.3）。
 * 管理端 confirm、审批中心 review、OpenAPI/Copilot 确认共用本服务。
 */
@Injectable()
export class ApprovalRuntimeService {
  private readonly logger = new Logger(ApprovalRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
    @Inject(forwardRef(() => AgentRuntimeService))
    private readonly agentRuntime: AgentRuntimeService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => TaskQueueService))
    private readonly taskQueueService: TaskQueueService,
  ) {}

  /**
   * POST /api/v1/sessions/:id/confirm — 按 messageId 定位待处理审批。
   */
  async confirmBySession(
    user: AuthUser,
    sessionId: string,
    messageId: string,
    action: ConfirmationAction,
    opinion?: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `会话不存在：${sessionId}`,
      });
    }
    await this.tenantScope.assertAccess(user, session.tenantId, { resource: '审批' });

    if (session.status !== 'pending_confirm') {
      throw new BadRequestException({
        code: 'SESSION_NOT_PENDING_CONFIRM',
        message: `会话不在待确认状态，当前：${session.status}`,
      });
    }

    const approval = await this.prisma.approval.findFirst({
      where: {
        sessionId,
        messageId,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!approval) {
      throw new NotFoundException({
        code: 'APPROVAL_NOT_FOUND',
        message: '未找到与该确认消息关联的待处理审批记录',
      });
    }

    return this.submitConfirmation({
      approvalId: approval.id,
      action,
      opinion,
      actor: {
        id: user.id,
        name: user.username,
        type: 'user',
      },
      executionMode: 'sync',
    });
  }

  /**
   * 管理端审批中心 / OpenAPI / Copilot 统一入口。
   */
  async submitConfirmation(input: SubmitConfirmationInput) {
    const approval = await this.prisma.approval.findUnique({
      where: { id: input.approvalId },
    });
    if (!approval) {
      throw new NotFoundException({
        code: 'APPROVAL_NOT_FOUND',
        message: `审批记录不存在：${input.approvalId}`,
      });
    }

    if (approval.status !== 'pending') {
      throw new BadRequestException({
        code: 'APPROVAL_NOT_PENDING',
        message: `审批记录不在待确认状态，当前状态：${approval.status}`,
      });
    }

    const now = new Date();
    const newStatus: ApprovalStatus =
      input.action === 'approve' ? 'approved' : 'rejected';

    const updated = await this.prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: newStatus,
        // Copilot/OpenAPI actor.id 可能为 copilot:app:externalUser，非 UUID，不可写入 CHAR(36)
        reviewerId: this.resolveReviewerUserId(input.actor.id),
        reviewerName: input.actor.name ?? input.actor.id,
        opinion: input.opinion ?? null,
        reviewedAt: now,
      },
    });

    await this.logApprovalAudit(updated, input);

    if (input.action === 'approve') {
      await this.onApprovedLinkage(approval);

      const workerResumed = await this.tryResumeWorkerTask(updated);
      if (workerResumed) {
        return {
          approval: toApprovalView(updated),
          resumed: true,
          taskId: workerResumed.taskId,
        };
      }

      const mode = input.executionMode ?? 'async';
      if (mode === 'sync') {
        const resumeResult = await this.agentRuntime.resumeFromApproval(
          updated,
          input.actor,
        );
        return {
          approval: toApprovalView(updated),
          resumed: true,
          ...resumeResult,
        };
      }
      void this.agentRuntime
        .resumeFromApproval(updated, input.actor)
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `审批通过后异步恢复失败 approval=${approval.id}: ${msg}`,
            err instanceof Error ? err.stack : undefined,
          );
        });
      return {
        approval: toApprovalView(updated),
        resumed: true,
      };
    }

    await this.onRejectedLinkage(approval, input.opinion);
    return {
      approval: toApprovalView(updated),
      resumed: false,
    };
  }

  /** 管理端审批中心 review（AuthUser） */
  async reviewByUser(
    user: AuthUser,
    approvalId: string,
    action: ReviewAction,
    opinion?: string,
  ) {
    const approval = await this.prisma.approval.findUnique({
      where: { id: approvalId },
    });
    if (!approval) {
      throw new NotFoundException({
        code: 'APPROVAL_NOT_FOUND',
        message: `审批记录不存在：${approvalId}`,
      });
    }
    await this.tenantScope.assertAccess(user, approval.tenantId, { resource: '审批' });

    return this.submitConfirmation({
      approvalId,
      action: action === ReviewAction.approve ? 'approve' : 'reject',
      opinion,
      actor: { id: user.id, name: user.username, type: 'user' },
      executionMode: 'async',
    });
  }

  /** OpenAPI：校验租户后提交 */
  async reviewByOpenApi(
    allowedTenantIds: string[],
    approvalId: string,
    action: ConfirmationAction,
    opinion: string | undefined,
    app: { appId: string; appName: string },
  ) {
    const approval = await this.prisma.approval.findUnique({
      where: { id: approvalId },
    });
    if (!approval) {
      throw new ForbiddenException({
        code: 'APPROVAL_NOT_FOUND',
        message: `审批记录不存在：${approvalId}`,
      });
    }
    if (!allowedTenantIds.includes(approval.tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '应用无权访问该租户审批',
      });
    }

    return this.submitConfirmation({
      approvalId,
      action,
      opinion,
      actor: { id: app.appId, name: app.appName, type: 'openapi_app' },
      executionMode: 'async',
    });
  }

  /** Copilot：校验租户后提交 */
  async reviewByCopilot(
    tenantId: string,
    approvalId: string,
    action: ConfirmationAction,
    opinion: string | undefined,
    actor: { id: string; name?: string },
  ) {
    const approval = await this.prisma.approval.findUnique({
      where: { id: approvalId },
    });
    if (!approval || approval.tenantId !== tenantId) {
      throw new ForbiddenException({
        code: 'APPROVAL_NOT_FOUND',
        message: '审批记录不存在',
      });
    }

    return this.submitConfirmation({
      approvalId,
      action,
      opinion,
      actor: { ...actor, type: 'copilot' },
      executionMode: 'async',
    });
  }

  /**
   * 审批超时批量处理（job-worker 调用）。
   * 标记 approval 为 timeout，并将会话/任务移出 pending_confirm。
   */
  async markExpiredAsTimeout(): Promise<number> {
    const expired = await this.prisma.approval.findMany({
      where: {
        status: 'pending',
        expiredAt: { lte: new Date() },
      },
    });

    if (expired.length === 0) return 0;

    await this.prisma.approval.updateMany({
      where: {
        status: 'pending',
        expiredAt: { lte: new Date() },
      },
      data: { status: 'timeout' },
    });

    for (const approval of expired) {
      await this.onTimeoutLinkage(approval);
    }

    this.logger.log(`已标记 ${expired.length} 条审批为超时并完成联动`);
    return expired.length;
  }

  // ── Worker 任务续跑（方案 B / remediation 04）────────────────

  /**
   * 异步 workflow 任务在步骤 pending_confirm 后，审批通过时重新入队由 worker 续跑。
   * 有 task_step 且 requestContext.resumeVia=job-worker 时优先走此路径，避免重复跑 Runtime Handler。
   */
  private async tryResumeWorkerTask(
    approval: Approval,
  ): Promise<{ taskId: string } | null> {
    if (!approval.taskId) return null;

    const ctx = (approval.requestContext ?? {}) as Record<string, unknown>;
    if (ctx.resumeVia !== 'job-worker') {
      const stepCount = await this.prisma.taskStep.count({
        where: { taskId: approval.taskId },
      });
      if (stepCount === 0) return null;
    }

    const task = await this.prisma.task.findUnique({
      where: { id: approval.taskId },
    });
    if (!task || task.type !== 'async') return null;

    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'pending' },
    });

    await this.taskQueueService.enqueue(task.id, task.tenantId);
    this.logger.log(
      `Worker 任务 ${task.id} 审批通过，已重新入队续跑`,
    );

    return { taskId: task.id };
  }

  // ── 联动（不写 Tool，仅状态与 Message）────────────────────

  private async onApprovedLinkage(approval: Approval) {
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
    await this.appendConfirmationMessage(approval, 'confirm_approved');
  }

  private async onRejectedLinkage(approval: Approval, opinion?: string) {
    const reason = opinion ?? '审批被驳回';
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
          failReason: `审批驳回：${reason}`,
        },
      });
    }
    await this.appendConfirmationMessage(approval, 'confirm_rejected', reason);
  }

  private async onTimeoutLinkage(approval: Approval) {
    const reason = '审批超时未处理';
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
          failReason: reason,
        },
      });
    }
    await this.appendConfirmationMessage(approval, 'confirm_timeout', reason);
  }

  private async appendConfirmationMessage(
    approval: Approval,
    type: string,
    reason?: string,
  ) {
    if (!approval.sessionId) return;
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
          type,
          approvalId: approval.id,
          actionType: approval.actionType,
          ...(reason ? { reason } : {}),
        },
        seq: (lastMsg?.seq ?? 0) + 1,
      },
    });
  }

  private async logApprovalAudit(
    approval: Approval,
    input: SubmitConfirmationInput,
  ) {
    const actionKey =
      input.action === 'approve' ? 'approval.approve' : 'approval.reject';
    const module =
      input.actor.type === 'user' ? 'approval.manage' : 'openapi.confirm';

    await this.auditService.logUserAction({
      tenantId: approval.tenantId,
      operatorUserId: input.actor.type === 'user' ? input.actor.id : null,
      operatorName: input.actor.name ?? input.actor.id,
      action: actionKey,
      module,
      targetType: 'approval',
      targetId: approval.id,
      summary: `${input.action === 'approve' ? '确认执行' : '驳回'}：${approval.actionType}`,
      diff: {
        sessionId: approval.sessionId,
        taskId: approval.taskId,
        opinion: input.opinion ?? null,
        actorType: input.actor.type,
      },
      status: AuditStatus.success,
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });
  }

  /** 仅平台 user.id（UUID）写入 reviewer_id；Copilot/OpenAPI 外部主体仅存 reviewer_name */
  private resolveReviewerUserId(actorId: string): string | null {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      actorId,
    )
      ? actorId
      : null;
  }
}
