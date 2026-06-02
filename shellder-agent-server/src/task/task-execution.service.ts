import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditStatus, Prisma, Task, Tool } from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { ApprovalService } from '../approval/approval.service';
import { getCapabilityHandler } from '../agent-runtime/capability-handlers';
import { RuntimeContext, SseEvent } from '../agent-runtime/agent-runtime.types';
import { AuditService } from '../audit/audit.service';
import { decryptSecret } from '../connector/connector-secret.util';
import { PrismaService } from '../prisma/prisma.service';
import { SqlToolService } from '../tool/sql-tool.service';
import {
  HttpToolConfig,
  SqlToolConfig,
  WorkflowToolConfig,
} from '../tool/tool.types';
import { TaskService } from './task.service';
import {
  CapabilityExecutionResult,
  PrepareTaskResult,
  StepExecutionResult,
} from './task-execution.types';

type StepInput = {
  toolId?: string;
  needConfirmation?: boolean;
  userMessage?: string;
};

/**
 * 异步任务步骤 / 能力执行（供 job-worker 经内网 HTTP 调用）。
 * 复用四类业务能力 Handler 与子 Tool 执行逻辑，避免在 worker 重复装配 Nest 依赖。
 */
@Injectable()
export class TaskExecutionService {
  private readonly logger = new Logger(TaskExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
    private readonly approvalService: ApprovalService,
    private readonly auditService: AuditService,
    private readonly sqlToolService: SqlToolService,
  ) {}

  async prepareTask(taskId: string): Promise<PrepareTaskResult> {
    const task = await this.getTaskOrThrow(taskId);
    const existing = await this.prisma.taskStep.count({ where: { taskId } });
    if (existing > 0) {
      return { taskId, stepCount: existing, createdSteps: 0 };
    }

    let created = 0;
    if (task.capabilityType === 'workflow') {
      created = await this.materializeWorkflowSteps(task);
    }

    const stepCount = await this.prisma.taskStep.count({ where: { taskId } });
    return { taskId, stepCount, createdSteps: created };
  }

  async executeStep(taskId: string, stepId: string): Promise<StepExecutionResult> {
    const task = await this.getTaskOrThrow(taskId);
    const step = await this.prisma.taskStep.findFirst({
      where: { id: stepId, taskId },
    });
    if (!step) {
      throw new NotFoundException({
        code: 'TASK_STEP_NOT_FOUND',
        message: `任务步骤不存在：${stepId}`,
      });
    }

    if (step.status === 'completed' || step.status === 'skipped') {
      return {
        success: true,
        output: step.output ?? { skipped: true, reason: 'already_completed' },
        durationMs: step.durationMs ?? 0,
      };
    }

    const stepInput = (step.input ?? {}) as StepInput;
    const toolId = stepInput.toolId;
    const startTime = Date.now();

    await this.prisma.task.update({
      where: { id: taskId },
      data: { currentNode: step.name },
    });

    if (!toolId) {
      const output = {
        message: `步骤「${step.name}」执行完成（无关联子工具）`,
      };
      await this.taskService.addLog(taskId, {
        type: 'state_change',
        level: 'info',
        message: `步骤完成: ${step.name}`,
        stepId,
        detail: { durationMs: Date.now() - startTime },
      });
      return { success: true, output, durationMs: Date.now() - startTime };
    }

    const tool = await this.prisma.tool.findUnique({
      where: { id: toolId },
      include: { connector: true },
    });
    if (!tool) {
      throw new BadRequestException({
        code: 'TOOL_NOT_FOUND',
        message: `子工具 ${toolId} 不存在`,
      });
    }

    const confirmResult = await this.guardStepConfirmation(
      task,
      step.id,
      tool,
      stepInput,
    );
    if (confirmResult) {
      return confirmResult;
    }

    await this.taskService.addLog(taskId, {
      type: 'tool_call',
      level: 'info',
      message: `工具调用开始: ${tool.name}`,
      stepId,
      detail: { toolId: tool.id, toolName: tool.name, phase: 'start' },
    });

    try {
      const ctx = this.buildRuntimeContext(task, stepInput);
      const output = await this.executeSubTool(tool, ctx);
      const durationMs = Date.now() - startTime;

      await this.taskService.addLog(taskId, {
        type: 'tool_call',
        level: 'info',
        message: `工具调用完成: ${tool.name}`,
        stepId,
        detail: {
          toolId: tool.id,
          toolName: tool.name,
          phase: 'end',
          status: 'success',
          durationMs,
          output,
        },
      });

      return {
        success: true,
        output,
        toolName: tool.name,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      await this.taskService.addLog(taskId, {
        type: 'tool_call',
        level: 'error',
        message: `工具调用失败: ${tool.name} — ${errorMsg}`,
        stepId,
        detail: {
          toolId: tool.id,
          toolName: tool.name,
          phase: 'end',
          status: 'failed',
          durationMs,
          error: errorMsg,
        },
      });

      return {
        success: false,
        error: errorMsg,
        toolName: tool.name,
        durationMs,
      };
    }
  }

  async executeCapability(taskId: string): Promise<CapabilityExecutionResult> {
    const task = await this.getTaskOrThrow(taskId);
    if (!task.capabilityType) {
      throw new BadRequestException({
        code: 'CAPABILITY_TYPE_MISSING',
        message: '任务未指定 capabilityType',
      });
    }

    const handler = getCapabilityHandler(task.capabilityType);
    if (!handler) {
      throw new BadRequestException({
        code: 'HANDLER_NOT_FOUND',
        message: `未注册的能力 Handler: ${task.capabilityType}`,
      });
    }

    const ctx = this.buildRuntimeContext(task);
    const collectedEvents: SseEvent[] = [];

    await this.taskService.addLog(taskId, {
      type: 'state_change',
      level: 'info',
      message: `开始执行 ${task.capabilityType} 能力`,
    });

    const handlerResult = await handler.execute(ctx, (event) => {
      collectedEvents.push(event);
      this.persistSseAsLog(taskId, event).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`写入 SSE 日志失败 task=${taskId}: ${msg}`);
      });
    });

    if (handlerResult.output && typeof handlerResult.output === 'object') {
      const out = handlerResult.output as { status?: string };
      if (out.status === 'pending_confirm') {
        return {
          success: false,
          needConfirmation: true,
          output: handlerResult.output,
          error: handlerResult.error,
        };
      }
    }

    return {
      success: handlerResult.success,
      output: handlerResult.output,
      error: handlerResult.error,
    };
  }

  // ── workflow 步骤物化 ─────────────────────────────────────

  private async materializeWorkflowSteps(task: Task): Promise<number> {
    const input = (task.input ?? {}) as Record<string, unknown>;
    const toolIds =
      (input.toolIds as string[] | undefined) ??
      (input.workflowToolId ? [String(input.workflowToolId)] : []);

    if (toolIds.length === 0) {
      this.logger.warn(`Workflow 任务 ${task.id} 缺少 workflowToolId/toolIds，无法物化步骤`);
      return 0;
    }

    const workflowTool = await this.prisma.tool.findUnique({
      where: { id: toolIds[0] },
    });
    if (!workflowTool || workflowTool.type !== 'workflow') {
      throw new BadRequestException({
        code: 'WORKFLOW_TOOL_INVALID',
        message: `流程工具 ${toolIds[0]} 不存在或非 workflow 类型`,
      });
    }

    const config = this.readWorkflowConfig(workflowTool);
    if (!config.steps?.length) {
      throw new BadRequestException({
        code: 'WORKFLOW_STEPS_EMPTY',
        message: `流程工具「${workflowTool.name}」未配置编排步骤`,
      });
    }

    for (let i = 0; i < config.steps.length; i++) {
      const wfStep = config.steps[i];
      await this.prisma.taskStep.create({
        data: {
          taskId: task.id,
          seq: i + 1,
          name: wfStep.name,
          description: wfStep.description ?? null,
          toolName: wfStep.toolId ? null : wfStep.name,
          input: wfStep.toolId
            ? ({ toolId: wfStep.toolId } as InputJsonValue)
            : Prisma.JsonNull,
          status: 'pending',
        },
      });
    }

    await this.taskService.addLog(task.id, {
      type: 'state_change',
      level: 'info',
      message: `已从 Workflow Tool「${workflowTool.name}」物化 ${config.steps.length} 个步骤`,
      detail: { workflowToolId: workflowTool.id },
    });

    return config.steps.length;
  }

  // ── 确认节点 ────────────────────────────────────────────────

  private async guardStepConfirmation(
    task: Task,
    stepId: string,
    tool: Tool,
    stepInput: StepInput,
  ): Promise<StepExecutionResult | null> {
    const needsConfirm =
      stepInput.needConfirmation === true || tool.needConfirmation === true;
    if (!needsConfirm) return null;

    const approved = await this.prisma.approval.findFirst({
      where: {
        taskId: task.id,
        status: 'approved',
      },
      orderBy: { reviewedAt: 'desc' },
    });
    if (approved) {
      return null;
    }

    const pending = await this.prisma.approval.findFirst({
      where: {
        taskId: task.id,
        status: 'pending',
      },
    });
    if (pending) {
      return {
        success: false,
        needConfirmation: true,
        approvalId: pending.id,
        toolName: tool.name,
      };
    }

    const input = (task.input ?? {}) as Record<string, unknown>;
    const approval = await this.approvalService.create({
      tenantId: task.tenantId,
      sessionId: task.sessionId ?? undefined,
      taskId: task.id,
      initiatorId: task.userId ?? undefined,
      actionType: tool.name,
      actionSummary:
        stepInput.userMessage ??
        (input.userMessage as string | undefined) ??
        task.title ??
        undefined,
      riskLevel: tool.riskLevel === 'low' || tool.riskLevel === 'medium'
        ? tool.riskLevel
        : 'high',
      impactScope: `流程步骤「${stepId}」需人工确认后执行`,
      toolIds: [tool.id],
      requestContext: {
        taskId: task.id,
        stepId,
        toolId: tool.id,
        capabilityType: task.capabilityType,
        resumeVia: 'job-worker',
      },
    });

    await this.taskService.addLog(task.id, {
      type: 'confirmation',
      level: 'warn',
      message: `步骤等待人工确认: ${tool.name}`,
      stepId,
      detail: { approvalId: approval.id, toolId: tool.id },
    });

    if (task.sessionId) {
      await this.prisma.session.update({
        where: { id: task.sessionId },
        data: { status: 'pending_confirm', hasConfirmation: true },
      });
    }

    return {
      success: false,
      needConfirmation: true,
      approvalId: approval.id,
      toolName: tool.name,
    };
  }

  // ── 子 Tool 执行（与 WorkflowCapabilityHandler 对齐）────────

  private async executeSubTool(tool: Tool & { connector: any }, ctx: RuntimeContext) {
    if (tool.status === 'disabled') {
      throw new Error(`子工具「${tool.name}」已停用`);
    }

    switch (tool.type) {
      case 'query':
        return this.executeQuerySubTool(tool, ctx);
      case 'action':
      case 'notification':
        return this.executeHttpSubTool(tool, ctx);
      default:
        return { message: `子工具类型 ${tool.type} 暂不支持嵌套编排` };
    }
  }

  private async executeQuerySubTool(tool: any, ctx: RuntimeContext) {
    if (!tool.connector) throw new Error(`查询子工具「${tool.name}」未关联连接器`);
    if (tool.connector.type !== 'db_readonly') {
      throw new Error(`查询子工具「${tool.name}」连接器类型非 db_readonly`);
    }

    const sqlConfig: SqlToolConfig = (tool.config as any)?.sql ?? {
      tableBlacklist: [],
      fieldBlacklist: [],
      maxRows: 100,
      maxExecutionMs: 3000,
      templates: [],
    };

    const sql = sqlConfig.templates?.[0]?.sql;
    if (!sql) throw new Error(`查询子工具「${tool.name}」无 SQL 模板`);

    const result = await this.sqlToolService.execute(tool.connector, sql, {}, sqlConfig);
    return { rows: result.rows, rowCount: result.rowCount, durationMs: result.durationMs };
  }

  private async executeHttpSubTool(tool: any, ctx: RuntimeContext) {
    if (!tool.connector) throw new Error(`操作子工具「${tool.name}」未关联连接器`);

    const httpConfig: HttpToolConfig = (tool.config as any)?.http ?? {
      method: 'POST',
      path: '',
    };
    const url = this.joinUrl(tool.connector.target, httpConfig.path);
    const method = (httpConfig.method || 'POST').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.buildAuthHeaders(tool.connector),
      ...(httpConfig.headers ?? {}),
    };

    const requestBody = httpConfig.bodyTemplate ?? { message: ctx.userMessage };
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const body = hasBody ? JSON.stringify(requestBody) : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tool.timeoutMs ?? 10000);

    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      clearTimeout(timer);

      const text = await res.text();
      const parsed = this.tryParseJson(text);

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      await this.auditService.logExternalCall({
        tenantId: ctx.tenantId,
        connectorId: tool.connector.id,
        target: tool.connector.target,
        method,
        callerUserId: ctx.userId,
        requestSummary: `[Workflow/${tool.name}]`,
        status: AuditStatus.success,
        statusCode: res.status,
        durationMs: 0,
        errorMessage: null,
      });

      return { status: res.status, data: parsed ?? text };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ── helpers ─────────────────────────────────────────────────

  private buildRuntimeContext(task: Task, stepInput?: StepInput): RuntimeContext {
    const input = (task.input ?? {}) as Record<string, unknown>;
    const userMessage =
      stepInput?.userMessage ??
      (input.userMessage as string | undefined) ??
      task.title ??
      '';

    return {
      sessionId: task.sessionId ?? task.id,
      tenantId: task.tenantId,
      userId: task.userId ?? 'system',
      userMessage,
      capabilityType: task.capabilityType ?? undefined,
      toolIds: (input.toolIds as string[] | undefined) ?? [],
      needConfirmation: false,
      timeoutMs: task.timeoutMs,
      maxRetries: task.maxRetries,
    };
  }

  private async getTaskOrThrow(taskId: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: `任务不存在：${taskId}`,
      });
    }
    return task;
  }

  private readWorkflowConfig(tool: Tool): WorkflowToolConfig {
    const config = (tool.config as any)?.workflow;
    return config ?? { steps: [] };
  }

  private async persistSseAsLog(taskId: string, event: SseEvent) {
    if (event.event === 'tool_start') {
      await this.taskService.addLog(taskId, {
        type: 'tool_call',
        level: 'info',
        message: `工具调用开始: ${String(event.data.toolName ?? 'unknown')}`,
        detail: event.data,
      });
      return;
    }
    if (event.event === 'tool_end') {
      await this.taskService.addLog(taskId, {
        type: 'tool_call',
        level: event.data.status === 'failed' ? 'error' : 'info',
        message: `工具调用结束: ${String(event.data.toolName ?? 'unknown')}`,
        detail: event.data,
      });
    }
  }

  private buildAuthHeaders(connector: any): Record<string, string> {
    const secret = decryptSecret(connector.config?.secretCipher);
    const headers: Record<string, string> = {};
    if (!secret) return headers;

    switch (connector.authType) {
      case 'basic': {
        const u = String(secret.username ?? '');
        const p = String(secret.password ?? '');
        headers.Authorization = `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
        break;
      }
      case 'bearer':
        if (secret.token) headers.Authorization = `Bearer ${String(secret.token)}`;
        break;
      case 'api_key': {
        const name = String(secret.headerName ?? 'X-API-Key');
        if (secret.apiKey) headers[name] = String(secret.apiKey);
        break;
      }
      default:
        break;
    }
    return headers;
  }

  private joinUrl(base: string, path: string): string {
    if (!path) return base;
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  private tryParseJson(text: string): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
