import { Injectable, Logger } from '@nestjs/common';
import { AuditStatus, Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SqlToolService } from '../tool/sql-tool.service';
import { ToolService } from '../tool/tool.service';
import { decryptSecret } from '../connector/connector-secret.util';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from '../agent-runtime/agent-runtime.types';
import { CapabilityResult, WorkflowStepResult } from './capability-result';
import { WorkflowToolConfig, WorkflowStep, SqlToolConfig, HttpToolConfig } from '../tool/tool.types';

/**
 * 流程型能力 Handler（§5.4）。
 *
 * 多步骤编排；串联查询/操作/通知：
 * - Workflow Tool + 按需 Query/Action/Notification
 * - 任务状态化（09）；job-worker 执行长流程
 * - 步骤日志写入 Task 执行日志
 * - 异步执行与状态跟踪；中断、确认、继续
 * - 长任务在任务中心可见进度（验收标准 4）
 */
@Injectable()
export class WorkflowCapabilityHandler implements CapabilityHandler {
  readonly type = 'workflow';
  private readonly logger = new Logger(WorkflowCapabilityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly sqlToolService: SqlToolService,
    private readonly toolService: ToolService,
  ) {}

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    const toolIds = ctx.toolIds ?? [];
    if (toolIds.length === 0) {
      const msg = '未指定流程工具（Workflow Tool），无法执行流程型能力。';
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'workflow',
        data: { text: msg },
        steps: [],
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    const workflowToolId = toolIds[0];
    const workflowTool = await this.prisma.tool.findUnique({
      where: { id: workflowToolId },
    });

    if (!workflowTool || workflowTool.type !== 'workflow') {
      const msg = `工具 ${workflowToolId} 不存在或非流程型`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'workflow',
        data: { text: msg },
        steps: [],
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (workflowTool.status === 'disabled') {
      const msg = `流程工具「${workflowTool.name}」已停用`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'workflow',
        data: { text: msg },
        steps: [],
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    const workflowConfig = this.readWorkflowConfig(workflowTool);
    if (!workflowConfig.steps || workflowConfig.steps.length === 0) {
      const msg = `流程工具「${workflowTool.name}」未配置编排步骤`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'workflow',
        data: { text: msg },
        steps: [],
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    emitSse({
      event: 'tool_start',
      data: {
        toolName: workflowTool.name,
        toolId: workflowTool.id,
        input: { workflow: workflowConfig.steps.map((s) => s.name), userMessage: ctx.userMessage },
      },
    });

    // 创建任务（任务中心可见 — 验收标准 4）
    const task = await this.prisma.task.create({
      data: {
        tenantId: ctx.tenantId,
        sessionId: ctx.sessionId,
        userId: ctx.userId,
        title: `流程：${workflowTool.name}`,
        type: 'async',
        status: 'running',
        capabilityType: 'workflow',
        input: { userMessage: ctx.userMessage } as any,
        startedAt: new Date(),
      },
    });

    emitSse({
      event: 'delta',
      data: { text: `开始执行流程「${workflowTool.name}」（任务 ${task.id}）...\n\n` },
    });

    const stepResults: WorkflowStepResult[] = [];
    const textChunks: string[] = [`开始执行流程「${workflowTool.name}」...\n\n`];
    let allSuccess = true;

    for (let i = 0; i < workflowConfig.steps.length; i++) {
      const step = workflowConfig.steps[i];
      const stepSeq = i + 1;

      // 创建 task_step
      const taskStep = await this.prisma.taskStep.create({
        data: {
          taskId: task.id,
          seq: stepSeq,
          name: step.name,
          description: step.description ?? null,
          status: 'running',
          toolName: step.toolId ? undefined : step.name,
          startedAt: new Date(),
        },
      });

      // 更新任务当前节点
      await this.prisma.task.update({
        where: { id: task.id },
        data: { currentNode: step.name },
      });

      emitSse({
        event: 'delta',
        data: { text: `[步骤 ${stepSeq}/${workflowConfig.steps.length}] ${step.name}...` },
      });

      const stepStartTime = Date.now();
      let stepOutput: unknown = null;
      let stepError: string | undefined;
      let stepStatus: 'completed' | 'failed' = 'completed';

      try {
        if (step.toolId) {
          stepOutput = await this.executeSubTool(step.toolId, ctx);
        } else {
          stepOutput = { message: `步骤「${step.name}」执行完成（无关联子工具）` };
        }

        const stepDuration = Date.now() - stepStartTime;

        await this.prisma.taskStep.update({
          where: { id: taskStep.id },
          data: {
            status: 'completed',
            output: stepOutput as any,
            durationMs: stepDuration,
            completedAt: new Date(),
          },
        });

        await this.logTaskEvent(task.id, taskStep.id, 'state_change', `步骤 ${step.name} 完成`);

        const stepMsg = ` 完成（${stepDuration}ms）\n`;
        emitSse({ event: 'delta', data: { text: stepMsg } });
        textChunks.push(`[步骤 ${stepSeq}] ${step.name}${stepMsg}`);

        stepResults.push({
          seq: stepSeq,
          name: step.name,
          toolName: step.toolId ?? undefined,
          status: 'completed',
          output: stepOutput,
          durationMs: stepDuration,
        });
      } catch (err) {
        const stepDuration = Date.now() - stepStartTime;
        stepError = err instanceof Error ? err.message : String(err);
        stepStatus = 'failed';
        allSuccess = false;

        await this.prisma.taskStep.update({
          where: { id: taskStep.id },
          data: {
            status: 'failed',
            failReason: stepError,
            durationMs: stepDuration,
            completedAt: new Date(),
          },
        });

        await this.logTaskEvent(task.id, taskStep.id, 'error', `步骤 ${step.name} 失败：${stepError}`);

        const errMsg = ` 失败：${stepError}\n`;
        emitSse({ event: 'delta', data: { text: errMsg } });
        textChunks.push(`[步骤 ${stepSeq}] ${step.name}${errMsg}`);

        stepResults.push({
          seq: stepSeq,
          name: step.name,
          toolName: step.toolId ?? undefined,
          status: 'failed',
          durationMs: stepDuration,
          error: stepError,
        });

        break;
      }
    }

    const totalDuration = Date.now() - Date.parse(task.startedAt?.toISOString() ?? new Date().toISOString());
    const finalStatus = allSuccess ? 'completed' : 'failed';

    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: finalStatus,
        output: { steps: stepResults } as any,
        completedAt: new Date(),
        currentNode: null,
      },
    });

    emitSse({
      event: 'tool_end',
      data: {
        toolName: workflowTool.name,
        toolId: workflowTool.id,
        status: allSuccess ? 'success' : 'failed',
        durationMs: totalDuration,
        output: { taskId: task.id, stepCount: stepResults.length },
      },
    });

    const summaryText = allSuccess
      ? `\n流程「${workflowTool.name}」全部 ${stepResults.length} 步执行完成。`
      : `\n流程「${workflowTool.name}」在第 ${stepResults.length} 步失败。`;
    emitSse({ event: 'delta', data: { text: summaryText } });
    textChunks.push(summaryText);

    const result: CapabilityResult = {
      capabilityType: 'workflow',
      data: {
        text: textChunks.join(''),
        taskId: task.id,
      },
      steps: stepResults,
      status: allSuccess ? 'success' : 'failed',
      error: allSuccess ? undefined : stepResults.find((s) => s.error)?.error,
    };

    return {
      success: allSuccess,
      output: result,
      textChunks,
      error: allSuccess ? undefined : result.error,
    };
  }

  private async executeSubTool(toolId: string, ctx: RuntimeContext): Promise<unknown> {
    const tool = await this.prisma.tool.findUnique({
      where: { id: toolId },
      include: { connector: true },
    });

    if (!tool) throw new Error(`子工具 ${toolId} 不存在`);
    if (tool.status === 'disabled') throw new Error(`子工具「${tool.name}」已停用`);

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

  private async executeQuerySubTool(tool: any, ctx: RuntimeContext): Promise<unknown> {
    if (!tool.connector) throw new Error(`查询子工具「${tool.name}」未关联连接器`);
    if (tool.connector.type !== 'db_readonly') {
      throw new Error(`查询子工具「${tool.name}」连接器类型非 db_readonly`);
    }

    const sqlConfig: SqlToolConfig = (tool.config as any)?.sql ?? {
      tableWhitelist: [],
      fieldWhitelist: [],
      maxRows: 100,
      maxExecutionMs: 3000,
      templates: [],
    };

    const sql = sqlConfig.templates?.[0]?.sql;
    if (!sql) throw new Error(`查询子工具「${tool.name}」无 SQL 模板`);

    const result = await this.sqlToolService.execute(tool.connector, sql, {}, sqlConfig);
    return { rows: result.rows, rowCount: result.rowCount, durationMs: result.durationMs };
  }

  private async executeHttpSubTool(tool: any, ctx: RuntimeContext): Promise<unknown> {
    if (!tool.connector) throw new Error(`操作子工具「${tool.name}」未关联连接器`);

    const httpConfig: HttpToolConfig = (tool.config as any)?.http ?? { method: 'POST', path: '' };
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

  private async logTaskEvent(
    taskId: string,
    stepId: string | null,
    type: string,
    message: string,
  ) {
    await this.prisma.taskLog.create({
      data: {
        taskId,
        stepId,
        type: type as any,
        level: type === 'error' ? 'error' : 'info',
        message,
      },
    });
  }

  private readWorkflowConfig(tool: Tool): WorkflowToolConfig {
    const config = (tool.config as any)?.workflow;
    return config ?? { steps: [] };
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
