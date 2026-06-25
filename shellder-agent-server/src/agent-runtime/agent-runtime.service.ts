import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Approval, AuditStatus, CapabilityType, MessageType, Prisma, ToolType } from '@prisma/client';
import { RoutingTestResult } from '../capability/dto/routing-test.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalService } from '../approval/approval.service';
import { RoutingEngineService } from '../capability/routing-engine.service';
import { SessionService } from '../session/session.service';
import { AuthUser } from '../auth/jwt.types';
import { SseEmitterService } from './sse-emitter.service';
import { getCapabilityHandler } from './capability-handlers';
import {
  PrincipalContext,
  RuntimeContext,
  SseEvent,
  SendMessageMode,
} from './agent-runtime.types';
import { parsePrincipalContextFromDb } from '../copilot/principal-context.types';
import {
  CONFIG_KEYS,
  SystemSettingsService,
} from '../system-settings/system-settings.service';
import { truncate } from '../audit/audit.constants';
import { SendMessageDto } from './dto/send-message.dto';
import { ConfirmationActor } from '../approval/approval-runtime.types';
import { SessionTitleService } from './session-title.service';
import { applicationProperties } from '@shellder/config';

/**
 * Agent Runtime 编排骨架（架构 §4.5 / 执行计划 §4.1）。
 *
 * 请求处理调用顺序（架构 §4.2）：
 * 1. 接入层创建/复用 Session，用户消息写入 Message
 * 2. Agent Runtime 装配上下文，调用 Capability Routing
 * 3. 按能力类型执行（问答召回 / SQL Query / Action / Workflow 等）
 * 4. Tool 执行前 Policy 校验；高风险经确认节点可继续
 * 5. 结果写入 Message / Task；流式阶段 SSE 推送
 */
@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => ApprovalService))
    private readonly approvalService: ApprovalService,
    private readonly routingEngine: RoutingEngineService,
    private readonly sessionService: SessionService,
    private readonly sseEmitter: SseEmitterService,
    private readonly systemSettings: SystemSettingsService,
    private readonly sessionTitleService: SessionTitleService,
  ) {}

  /** 能力 Handler 总超时（Copilot 预览 / 嵌入会话共用） */
  private async resolveCapabilityTimeoutMs(
    capabilityType: string,
  ): Promise<number> {
    const raw = await this.systemSettings.getConfigValue(
      CONFIG_KEYS.DEFAULT_TIMEOUT_MS,
    );
    let ms = Number(raw);
    const app = applicationProperties.get().app;
    if (!Number.isFinite(ms) || ms <= 0) {
      ms = app.basic.defaultTimeoutMs;
    }
    if (capabilityType === 'query') {
      ms = Math.max(ms, app.capability.timeoutFloorMs);
    }
    return Math.min(
      Math.max(ms, app.capability.timeoutMinMs),
      app.capability.timeoutCeilingMs,
    );
  }

  /**
   * 发送消息并触发 Agent 编排（POST /api/v1/sessions/:id/messages）。
   *
   * sync 模式：等待编排完成后返回完整回复。
   * stream 模式：立即返回消息 ID，通过 SSE 推送流式结果。
   */
  async sendMessage(
    user: AuthUser,
    sessionId: string,
    dto: SendMessageDto,
  ): Promise<{
    messageId: string;
    assistantMessageId?: string;
    taskId?: string;
    capabilityType?: string;
    reply?: unknown;
  }> {
    const session = await this.sessionService.getOrThrow(sessionId);
    await this.sessionService.assertTenantAccess(user, session.tenantId);

    if (session.status === 'completed' || session.status === 'cancelled') {
      throw new BadRequestException({
        code: 'SESSION_CLOSED',
        message: '会话已结束，无法发送消息',
      });
    }
    if (session.status === 'pending_confirm') {
      throw new BadRequestException({
        code: 'SESSION_PENDING_CONFIRM',
        message: '会话等待人工确认中，请先完成确认操作',
      });
    }

    // Step 1: 写入用户消息
    const userMessage = await this.appendMessage(sessionId, 'user', {
      text: dto.content,
    });

    // 首条消息且无标题时异步生成会话标题（不阻塞主流程）
    if (!session.title && userMessage.seq === 1) {
      void this.sessionTitleService
        .generateTitle(sessionId, dto.content)
        .catch((err) =>
          this.logger.warn(`会话标题生成失败 session=${sessionId}: ${err.message}`),
        );
    }

    const mode: SendMessageMode = dto.mode ?? 'stream';

    if (mode === 'stream') {
      // 异步编排，通过 SSE 推送
      this.executeOrchestration(user, session, dto.content, userMessage.id)
        .catch((err) => {
          this.logger.error(`编排异常 session=${sessionId}: ${err.message}`, err.stack);
          this.sseEmitter.emit(sessionId, {
            event: 'error',
            data: { code: 'RUNTIME_ERROR', message: err.message },
          });
        });

      return {
        messageId: userMessage.id,
        capabilityType: session.capabilityType ?? undefined,
      };
    }

    // sync 模式：等待编排完成
    const result = await this.executeOrchestration(
      user,
      session,
      dto.content,
      userMessage.id,
    );

    return {
      messageId: userMessage.id,
      assistantMessageId: result.assistantMessageId,
      taskId: result.taskId,
      capabilityType: result.capabilityType,
      reply: result.reply,
    };
  }

  /**
   * 核心编排流程。
   */
  private async executeOrchestration(
    user: AuthUser,
    session: {
      id: string;
      tenantId: string;
      userId: string;
      capabilityType?: CapabilityType | null;
      principalContext?: unknown;
    },
    userMessage: string,
    userMessageId: string,
  ): Promise<{
    assistantMessageId?: string;
    taskId?: string;
    capabilityType?: string;
    reply?: unknown;
  }> {
    const sessionId = session.id;
    const tenantId = session.tenantId;
    const emitSse = (event: SseEvent) => this.sseEmitter.emit(sessionId, event);

    try {
      // Step 2: 两阶段路由（pinned 跳过 Stage1，Stage2 始终执行）
      const pinnedType = session.capabilityType ?? null;
      const routingResult = await this.routingEngine.routeFull(tenantId, userMessage, {
        pinnedCapabilityType: pinnedType ?? undefined,
        userId: user.id,
      });

      const capabilityType = routingResult.capabilityType;
      const toolIds = await this.resolveToolIds(tenantId, capabilityType, routingResult);

      // 更新 Session.capabilityType
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { capabilityType: capabilityType as CapabilityType },
      });

      // 路由结果写入消息元数据（含 typeStage + intraStage；pinned 也写入）
      await this.appendMessage(sessionId, 'system', {
        type: 'routing_result',
        capabilityType,
        capabilityName: routingResult.capabilityName,
        reason: routingResult.reason,
        candidates: routingResult.candidates,
        needConfirmation: routingResult.needConfirmation,
        typeStage: routingResult.typeStage,
        intraStage: routingResult.intraStage,
        pinnedCapability: !!pinnedType,
        resolvedToolIds: toolIds,
      });

      const principalContext = this.resolvePrincipalContext(session);
      const timeoutMs = await this.resolveCapabilityTimeoutMs(capabilityType);

      // 构建运行时上下文
      const ctx: RuntimeContext = {
        sessionId,
        tenantId,
        userId: user.id,
        username: user.username,
        userMessage,
        capabilityType,
        capabilityName: routingResult.capabilityName,
        routingReason: routingResult.reason,
        routingCandidates: routingResult.candidates,
        toolIds,
        needConfirmation: routingResult.needConfirmation,
        timeoutMs,
        maxRetries: applicationProperties.get().app.capability.defaultMaxRetries,
        principalContext,
      };

      // Step 3: 路由级确认拦截检查（嵌入 Copilot / 会话调试共用）
      if (routingResult.needConfirmation) {
        const policyHitCount = await this.persistPolicyHitsForContext(user, {
          tenantId,
          sessionId,
          userMessage,
          capabilityType,
          toolIds: ctx.toolIds,
        });
        if (policyHitCount === 0) {
          await this.recordRoutingConfirmHit(user, {
            tenantId,
            sessionId,
            userMessage,
            capabilityType,
            toolIds: ctx.toolIds,
            routingRuleId: routingResult.intraStage?.ruleId,
            routingRuleName: routingResult.intraStage?.ruleName,
          });
        }
        return await this.handleConfirmInterrupt(ctx, emitSse, '路由级确认');
      }

      // Step 4: Policy 校验（Tool 级别 — 如有 toolIds）
      if (ctx.toolIds && ctx.toolIds.length > 0) {
        for (const toolId of ctx.toolIds) {
          const tool = await this.prisma.tool.findUnique({
            where: { id: toolId },
          });
          if (!tool) continue;

          const policyDecision = await this.policyService.evaluate({
            tenantId,
            userId: user.id,
            toolName: tool.name,
            toolId: tool.id,
            riskLevel: tool.riskLevel as any,
            needConfirmation: tool.needConfirmation,
            capability: capabilityType,
            permissionScope: tool.permissionScope,
            requestSummary: userMessage,
            sessionId,
          });

          if (!policyDecision.allow) {
            // Policy 拒绝 — 不调用 Tool，返回明确错误事件（验收标准 3）
            emitSse({
              event: 'tool_end',
              data: {
                toolName: tool.name,
                toolId: tool.id,
                status: 'denied',
                error: policyDecision.reason ?? 'Policy 拒绝',
              },
            });

            await this.auditService.logToolCall({
              tenantId,
              toolId: tool.id,
              toolName: tool.name,
              callerUserId: user.id,
              callerName: user.username,
              sessionId,
              requestSummary: userMessage,
              status: AuditStatus.failed,
              errorMessage: policyDecision.reason ?? 'Policy denied',
              highRisk: policyDecision.highRisk,
            });

            const errorMsg = await this.appendMessage(sessionId, 'system', {
              type: 'policy_denied',
              toolName: tool.name,
              reason: policyDecision.reason,
            });

            emitSse({
              event: 'error',
              data: {
                code: 'POLICY_DENIED',
                message: policyDecision.reason ?? `工具 ${tool.name} 被策略拒绝`,
              },
            });
            emitSse({
              event: 'done',
              data: { messageId: errorMsg.id, capabilityType },
            });

            return {
              assistantMessageId: errorMsg.id,
              capabilityType,
              reply: {
                text: policyDecision.reason ?? `工具 ${tool.name} 被策略拒绝`,
              },
            };
          }

          // Policy 需要确认 — 确认中断
          if (policyDecision.needConfirm) {
            return await this.handleConfirmInterrupt(
              ctx,
              emitSse,
              policyDecision.reason ?? `工具 ${tool.name} 需要人工确认`,
            );
          }
        }
      }

      // Step 5: 执行能力 Handler
      const handler = getCapabilityHandler(capabilityType);
      if (!handler) {
        throw new Error(`未注册的能力类型 Handler: ${capabilityType}`);
      }

      // 超时控制
      const handlerResult = await this.withTimeout(
        handler.execute(ctx, emitSse),
        ctx.timeoutMs,
        `能力 ${capabilityType} 执行超时（${ctx.timeoutMs}ms）`,
      );

      // Tool 调用审计（handler 内部可能调用了 Tool）
      if (ctx.toolIds && ctx.toolIds.length > 0) {
        for (const toolId of ctx.toolIds) {
          const tool = await this.prisma.tool.findUnique({
            where: { id: toolId },
          });
          if (!tool) continue;

          await this.auditService.logToolCall({
            tenantId,
            toolId: tool.id,
            toolName: tool.name,
            callerUserId: user.id,
            callerName: user.username,
            sessionId,
            requestSummary:
              handlerResult.auditRequestSummary ?? userMessage,
            status: handlerResult.success
              ? AuditStatus.success
              : AuditStatus.failed,
            errorMessage: handlerResult.error ?? null,
            highRisk: false,
          });
        }
      }

      // Step 6: 写入助手回复消息
      const replyContent = handlerResult.output ?? {
        text: handlerResult.textChunks?.join('') ?? '',
      };
      const assistantMessage = await this.appendMessage(
        sessionId,
        'system',
        replyContent,
      );

      emitSse({
        event: 'done',
        data: {
          messageId: assistantMessage.id,
          capabilityType,
          summary: typeof replyContent === 'object' && 'text' in (replyContent as any)
            ? (replyContent as any).text
            : undefined,
        },
      });

      return {
        assistantMessageId: assistantMessage.id,
        capabilityType,
        reply: replyContent,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`编排失败 session=${sessionId}: ${message}`);

      emitSse({
        event: 'error',
        data: { code: 'RUNTIME_ERROR', message },
      });

      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'failed' },
      });

      throw err;
    }
  }

  /**
   * 确认中断处理（执行计划 §4.3 / Phase 14 审批中心）。
   * 遇 needConfirmation 写确认类 Message，创建 approval 记录，
   * 任务/会话状态 pending_confirm。
   */
  private async handleConfirmInterrupt(
    ctx: RuntimeContext,
    emitSse: (event: SseEvent) => void,
    reason: string,
  ): Promise<{
    assistantMessageId?: string;
      taskId?: string;
      capabilityType?: string;
      reply?: unknown;
  }> {
    let linkedTaskId: string | undefined;
    const confirmMessage = await this.appendMessage(
      ctx.sessionId,
      'confirmation',
      {
        type: 'confirm_required',
        reason,
        capabilityType: ctx.capabilityType,
        toolIds: ctx.toolIds,
        userMessage: ctx.userMessage,
      },
    );

    // 更新会话状态为 pending_confirm
    await this.prisma.session.update({
      where: { id: ctx.sessionId },
      data: {
        status: 'pending_confirm',
        hasConfirmation: true,
      },
    });

    const linkedTask = await this.prisma.task.findFirst({
      where: {
        sessionId: ctx.sessionId,
        status: { in: ['pending', 'running'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (linkedTask) {
      linkedTaskId = linkedTask.id;
      await this.prisma.task.update({
        where: { id: linkedTask.id },
        data: { status: 'pending_confirm' },
      });
    }

    // Phase 14: 创建审批记录
    let approvalId: string | undefined;
    let displayToolName = ctx.toolIds?.[0] ?? '';
    try {
      const tool = ctx.toolIds?.[0]
        ? await this.prisma.tool.findUnique({
            where: { id: ctx.toolIds[0] },
            select: { name: true, riskLevel: true },
          })
        : null;
      const toolName = tool?.name ?? ctx.toolIds?.[0] ?? '未知动作';
      displayToolName = toolName;
      const riskLevel =
        tool?.riskLevel === 'low' || tool?.riskLevel === 'medium'
          ? tool.riskLevel
          : 'high';

      const approval = await this.approvalService.create({
        tenantId: ctx.tenantId,
        sessionId: ctx.sessionId,
        taskId: linkedTask?.id,
        messageId: confirmMessage.id,
        initiatorId: ctx.userId,
        initiatorName: ctx.username,
        actionType: toolName,
        actionSummary: ctx.userMessage,
        riskLevel,
        impactScope: reason,
        toolIds: ctx.toolIds,
        requestContext: {
          userMessage: ctx.userMessage,
          capabilityType: ctx.capabilityType,
          capabilityName: ctx.capabilityName,
          toolIds: ctx.toolIds,
          needConfirmation: ctx.needConfirmation,
        },
      });
      approvalId = approval.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`创建审批记录失败: ${msg}`);
    }

    emitSse({
      event: 'confirm_required',
      data: {
        toolName: displayToolName,
        toolId: ctx.toolIds?.[0],
        reason,
        messageId: confirmMessage.id,
        approvalId,
      },
    });

    emitSse({
      event: 'done',
      data: {
        messageId: confirmMessage.id,
        capabilityType: ctx.capabilityType,
      },
    });

    return {
      assistantMessageId: confirmMessage.id,
      taskId: linkedTaskId,
      capabilityType: ctx.capabilityType,
      reply: { type: 'confirm_required', reason, approvalId },
    };
  }

  /**
   * 审批通过后从断点恢复执行（执行计划 14 §4）。
   * 根据 approval.requestContext 重建 RuntimeContext，执行能力 Handler 与挂起 Tool。
   */
  async resumeFromApproval(
    approval: Approval,
    _actor: ConfirmationActor,
  ): Promise<{
    assistantMessageId?: string;
    taskId?: string;
    capabilityType?: string;
  }> {
    if (!approval.sessionId) {
      throw new BadRequestException({
        code: 'APPROVAL_NO_SESSION',
        message: '审批记录未关联会话，无法恢复执行',
      });
    }

    const sessionId = approval.sessionId;
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `会话不存在：${sessionId}`,
      });
    }

    const ctxSnapshot = (approval.requestContext ?? {}) as Record<string, unknown>;
    const userMessage =
      (ctxSnapshot.userMessage as string) ??
      approval.actionSummary ??
      '';
    const capabilityType =
      (ctxSnapshot.capabilityType as string) ??
      session.capabilityType ??
      'action';
    const toolIds = this.normalizeToolIds(approval.toolIds, ctxSnapshot.toolIds);

    const initiator = approval.initiatorId
      ? await this.prisma.user.findUnique({
          where: { id: approval.initiatorId },
          select: { id: true, username: true },
        })
      : null;

    const timeoutMs = await this.resolveCapabilityTimeoutMs(capabilityType);
    const ctx: RuntimeContext = {
      sessionId,
      tenantId: approval.tenantId,
      userId: initiator?.id ?? approval.initiatorId ?? session.userId,
      username: initiator?.username ?? approval.initiatorName ?? undefined,
      userMessage,
      capabilityType,
      capabilityName: ctxSnapshot.capabilityName as string | undefined,
      routingReason: undefined,
      routingCandidates: undefined,
      toolIds,
      needConfirmation: false,
      timeoutMs,
      maxRetries: applicationProperties.get().app.capability.defaultMaxRetries,
      principalContext: this.resolvePrincipalContext(session),
    };

    const emitSse = (event: SseEvent) => this.sseEmitter.emit(sessionId, event);

    try {
      const handler = getCapabilityHandler(capabilityType);
      if (!handler) {
        throw new Error(`未注册的能力类型 Handler: ${capabilityType}`);
      }

      const handlerResult = await this.withTimeout(
        handler.execute(ctx, emitSse),
        ctx.timeoutMs,
        `能力 ${capabilityType} 执行超时（${ctx.timeoutMs}ms）`,
      );

      if (toolIds.length > 0) {
        for (const toolId of toolIds) {
          const tool = await this.prisma.tool.findUnique({
            where: { id: toolId },
          });
          if (!tool) continue;

          await this.auditService.logToolCall({
            tenantId: approval.tenantId,
            toolId: tool.id,
            toolName: tool.name,
            callerUserId: ctx.userId,
            callerName: ctx.username,
            sessionId,
            taskId: approval.taskId ?? undefined,
            requestSummary: userMessage,
            status: handlerResult.success
              ? AuditStatus.success
              : AuditStatus.failed,
            errorMessage: handlerResult.error ?? null,
            highRisk: tool.riskLevel === 'high',
          });
        }
      }

      const replyContent = handlerResult.output ?? {
        text: handlerResult.textChunks?.join('') ?? '',
      };
      const assistantMessage = await this.appendMessage(
        sessionId,
        'system',
        replyContent,
      );

      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          status: handlerResult.success ? 'active' : 'failed',
          hasConfirmation: false,
        },
      });

      if (approval.taskId) {
        await this.prisma.task.update({
          where: { id: approval.taskId },
          data: {
            status: handlerResult.success ? 'completed' : 'failed',
            failReason: handlerResult.success
              ? null
              : (handlerResult.error ?? '执行失败'),
            completedAt: new Date(),
          },
        });
      }

      emitSse({
        event: 'done',
        data: {
          messageId: assistantMessage.id,
          capabilityType,
          taskId: approval.taskId ?? undefined,
        },
      });

      return {
        assistantMessageId: assistantMessage.id,
        taskId: approval.taskId ?? undefined,
        capabilityType,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `断点恢复失败 approval=${approval.id}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );

      emitSse({
        event: 'error',
        data: { code: 'RESUME_FAILED', message },
      });

      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'failed', hasConfirmation: false },
      });

      if (approval.taskId) {
        await this.prisma.task.update({
          where: { id: approval.taskId },
          data: {
            status: 'failed',
            failReason: message,
            completedAt: new Date(),
          },
        });
      }

      throw err;
    }
  }

  // ── 辅助方法 ──────────────────────────────────────────────

  /** 从路由结果解析 toolIds（优先级：intraStage → candidates → dependent_tools → fallback） */
  private async resolveToolIds(
    tenantId: string,
    capabilityType: string,
    routingResult: RoutingTestResult,
  ): Promise<string[]> {
    const toolKindHint = routingResult.intraStage?.toolKind;

    const fromIntra = routingResult.intraStage?.toolIds ?? [];
    let validIntra = fromIntra.filter((id) => typeof id === 'string' && id.length > 0);
    if (validIntra.length > 0 && toolKindHint) {
      validIntra = await this.filterToolIdsByType(tenantId, validIntra, toolKindHint);
    }
    if (validIntra.length > 0) return validIntra;

    const fromCandidate =
      routingResult.candidates.find((c) => c.type === capabilityType)?.toolIds ??
      routingResult.candidates[0]?.toolIds ??
      [];
    let validCandidate = fromCandidate.filter((id) => typeof id === 'string' && id.length > 0);
    if (validCandidate.length > 0 && toolKindHint) {
      validCandidate = await this.filterToolIdsByType(tenantId, validCandidate, toolKindHint);
    }
    if (validCandidate.length > 0) return validCandidate;

    const cap = await this.prisma.capability.findFirst({
      where: { tenantId, status: 'enabled', type: capabilityType as CapabilityType },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: { dependentTools: true },
    });
    if (cap?.dependentTools && Array.isArray(cap.dependentTools)) {
      let fromDependent = (cap.dependentTools as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      );
      if (fromDependent.length > 0 && toolKindHint) {
        fromDependent = await this.filterToolIdsByType(tenantId, fromDependent, toolKindHint);
      }
      if (fromDependent.length > 0) return fromDependent;
    }

    if (capabilityType === 'qa') return [];

    if (capabilityType === 'action') {
      const types = this.resolveActionToolTypes(toolKindHint);
      const tool = await this.prisma.tool.findFirst({
        where: {
          tenantId,
          type: { in: types },
          status: 'enabled',
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: { id: true },
      });
      return tool ? [tool.id] : [];
    }

    const toolType = this.capabilityToToolType(capabilityType);
    if (!toolType) return [];

    const tool = await this.prisma.tool.findFirst({
      where: { tenantId, type: toolType, status: 'enabled' },
      orderBy: [{ updatedAt: 'desc' }],
      select: { id: true },
    });
    return tool ? [tool.id] : [];
  }

  private resolveActionToolTypes(toolKindHint?: string): ToolType[] {
    if (toolKindHint === 'http_query' || toolKindHint === 'action' || toolKindHint === 'notification') {
      return [toolKindHint as ToolType];
    }
    return [ToolType.action, ToolType.notification, ToolType.http_query];
  }

  private async filterToolIdsByType(
    tenantId: string,
    toolIds: string[],
    toolType: string,
  ): Promise<string[]> {
    const tools = await this.prisma.tool.findMany({
      where: {
        tenantId,
        id: { in: toolIds },
        status: 'enabled',
        type: toolType as ToolType,
      },
      select: { id: true },
    });
    return tools.map((t) => t.id);
  }

  private capabilityToToolType(capabilityType: string): ToolType | null {
    const map: Record<string, ToolType> = {
      query: ToolType.query,
      action: ToolType.action,
      workflow: ToolType.workflow,
    };
    return map[capabilityType] ?? null;
  }

  private resolvePrincipalContext(session: {
    principalContext?: unknown;
  }): PrincipalContext | undefined {
    return parsePrincipalContextFromDb(session.principalContext);
  }

  private normalizeToolIds(
    approvalToolIds: unknown,
    contextToolIds: unknown,
  ): string[] {
    const fromApproval = Array.isArray(approvalToolIds)
      ? (approvalToolIds as string[])
      : [];
    const fromContext = Array.isArray(contextToolIds)
      ? (contextToolIds as string[])
      : [];
    return fromApproval.length > 0 ? fromApproval : fromContext;
  }

  private async appendMessage(
    sessionId: string,
    type: MessageType | 'user' | 'system' | 'confirmation',
    content: unknown,
  ): Promise<{ id: string; seq: number }> {
    const roleMap: Record<string, string> = {
      user: 'user',
      system: 'assistant',
      tool: 'tool',
      confirmation: 'system',
    };

    const lastMsg = await this.prisma.message.findFirst({
      where: { sessionId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const nextSeq = (lastMsg?.seq ?? 0) + 1;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          sessionId,
          type: type as MessageType,
          role: (roleMap[type] ?? 'assistant') as any,
          content: content as Prisma.InputJsonValue,
          seq: nextSeq,
        },
      }),
      this.prisma.session.update({
        where: { id: sessionId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return { id: message.id, seq: message.seq };
  }

  /**
   * 写入 Policy 显式规则命中留痕（rule_hit）。
   * 路由阶段 checkNeedConfirmation 为预览不落库；Runtime 在确认中断前/Tool 执行前应调用本方法。
   */
  /** @returns 本次写入的 Policy 规则命中条数 */
  private async persistPolicyHitsForContext(
    user: AuthUser,
    params: {
      tenantId: string;
      sessionId: string;
      userMessage: string;
      capabilityType: string;
      toolIds?: string[];
    },
  ): Promise<number> {
    const { tenantId, sessionId, userMessage, capabilityType, toolIds } = params;
    let hitCount = 0;

    if (toolIds && toolIds.length > 0) {
      for (const toolId of toolIds) {
        const tool = await this.prisma.tool.findUnique({ where: { id: toolId } });
        if (!tool) continue;
        const decision = await this.policyService.evaluate(
          {
            tenantId,
            userId: user.id,
            callerName: user.username,
            toolName: tool.name,
            toolId: tool.id,
            riskLevel: tool.riskLevel as 'low' | 'medium' | 'high',
            needConfirmation: tool.needConfirmation,
            capability: capabilityType,
            permissionScope: tool.permissionScope,
            requestSummary: userMessage,
            sessionId,
          },
          { persistHits: true },
        );
        hitCount += decision.matchedRules.length;
      }
      return hitCount;
    }

    const decision = await this.policyService.evaluate(
      {
        tenantId,
        userId: user.id,
        callerName: user.username,
        capability: capabilityType,
        requestSummary: userMessage,
        sessionId,
      },
      { persistHits: true },
    );
    return decision.matchedRules.length;
  }

  /** 路由规则触发的确认（无 Policy 规则命中时）写入 rule_hit 留痕 */
  private async recordRoutingConfirmHit(
    user: AuthUser,
    params: {
      tenantId: string;
      sessionId: string;
      userMessage: string;
      capabilityType: string;
      toolIds?: string[];
      routingRuleId?: string;
      routingRuleName?: string;
    },
  ): Promise<void> {
    const { tenantId, sessionId, userMessage, capabilityType, toolIds, routingRuleName } =
      params;
    let toolName: string | null = null;
    if (toolIds?.[0]) {
      const tool = await this.prisma.tool.findUnique({
        where: { id: toolIds[0] },
        select: { name: true },
      });
      toolName = tool?.name ?? null;
    }

    try {
      await this.prisma.ruleHit.create({
        data: {
          ruleId: null,
          tenantId,
          ruleName: routingRuleName
            ? `[路由] ${routingRuleName}`
            : '[路由] 需人工确认',
          ruleType: 'custom',
          ruleAction: 'need_confirm',
          result: 'need_confirm',
          toolName,
          capability: capabilityType,
          requestSummary: truncate(userMessage),
          callerUserId: user.id,
          sessionId,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`路由级确认命中留痕失败：${message}`);
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    errorMessage: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
