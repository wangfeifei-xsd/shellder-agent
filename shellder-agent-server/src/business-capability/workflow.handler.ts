import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowToolInvoker } from '../tool/invoke/workflow-tool.invoker';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from '../agent-runtime/agent-runtime.types';
import { CapabilityResult, WorkflowStepResult } from './capability-result';
import { WorkflowToolConfig } from '../tool/tool.types';

/**
 * 流程型能力 Handler（§5.4）。
 *
 * 多步骤编排；串联查询/操作/通知/HTTP 查询：
 * - 子 Tool 经 WorkflowToolInvoker 统一执行
 * - 任务状态化（09）；步骤日志写入 Task
 */
@Injectable()
export class WorkflowCapabilityHandler implements CapabilityHandler {
  readonly type = 'workflow';
  private readonly logger = new Logger(WorkflowCapabilityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowInvoker: WorkflowToolInvoker,
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
    const visitedToolIds = new Set<string>();
    const previousStepOutputs: unknown[] = [];

    for (let i = 0; i < workflowConfig.steps.length; i++) {
      const step = workflowConfig.steps[i];
      const stepSeq = i + 1;

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

      try {
        if (step.toolId) {
          stepOutput = await this.workflowInvoker.executeSubTool(
            step.toolId,
            {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              userMessage: ctx.userMessage,
              sessionId: ctx.sessionId,
              callerName: ctx.username,
              source: 'runtime',
              principalContext: ctx.principalContext,
            },
            {
              visitedToolIds,
              depth: 1,
              step,
              stepIndex: i,
              previousStepOutputs,
            },
          );
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
        previousStepOutputs.push(stepOutput);
      } catch (err) {
        const stepDuration = Date.now() - stepStartTime;
        stepError = err instanceof Error ? err.message : String(err);
        allSuccess = false;

        this.logger.error(`Workflow 步骤失败 ${step.name}: ${stepError}`);

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
    const config = (tool.config as { workflow?: WorkflowToolConfig })?.workflow;
    return config ?? { steps: [] };
  }
}
