import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TaskExecutionClient } from '../task/task-execution.client';
import { TASK_QUEUE } from './queue.constants';

export interface TaskJobPayload {
  taskId: string;
  tenantId: string;
}

const RESUMABLE_STATUSES: TaskStatus[] = ['pending', 'running'];
const TERMINAL_STATUSES: TaskStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'timeout',
];

/**
 * 任务处理器（架构 §6.3 / 执行计划 09 + 13）。
 *
 * 职责边界（方案 B）：
 * - worker：BullMQ 消费、状态机、幂等续跑、task_log 状态类日志、失败重试
 * - agent-server /internal/tasks/*：四类能力 Handler / 子 Tool 实际执行
 */
@Processor(TASK_QUEUE, {
  concurrency: 5,
})
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionClient: TaskExecutionClient,
  ) {
    super();
  }

  async process(job: Job<TaskJobPayload>): Promise<Record<string, unknown>> {
    const { taskId, tenantId } = job.data;
    this.logger.log(`Processing task ${taskId} (tenant: ${tenantId}, job: ${job.id})`);

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      this.logger.warn(`Task ${taskId} not found, skipping`);
      return { skipped: true, reason: 'task_not_found' };
    }

    if (task.status === 'pending_confirm') {
      this.logger.log(`Task ${taskId} awaiting confirmation, skipping`);
      return { skipped: true, reason: 'awaiting_confirmation' };
    }

    if (TERMINAL_STATUSES.includes(task.status)) {
      this.logger.warn(`Task ${taskId} already terminal (${task.status}), skipping`);
      return { skipped: true, reason: `terminal_${task.status}` };
    }

    if (!RESUMABLE_STATUSES.includes(task.status)) {
      this.logger.warn(`Task ${taskId} status is ${task.status}, skipping`);
      return { skipped: true, reason: `unexpected_status_${task.status}` };
    }

    if (task.status === 'pending') {
      await this.updateTaskStatus(taskId, 'running');
      await this.addTaskLog(taskId, 'state_change', 'info', 'Worker 开始处理任务');
    } else {
      await this.addTaskLog(taskId, 'state_change', 'info', 'Worker 续跑任务（审批通过或重启恢复）');
    }

    try {
      const prepare = await this.executionClient.prepareTask(taskId);
      if (prepare.createdSteps > 0) {
        await this.addTaskLog(taskId, 'state_change', 'info',
          `已物化 ${prepare.createdSteps} 个 workflow 步骤`, {
            stepCount: prepare.stepCount,
          });
      }

      const steps = await this.prisma.taskStep.findMany({
        where: { taskId },
        orderBy: { seq: 'asc' },
      });

      if (steps.length > 0) {
        const stepOutputs: unknown[] = [];
        for (const step of steps) {
          const outcome = await this.processStep(taskId, step.id, step.name, step.status);
          if (outcome.waitingConfirmation) {
            return {
              success: true,
              taskId,
              waitingConfirmation: true,
              approvalId: outcome.approvalId,
            };
          }
          if (outcome.output !== undefined) {
            stepOutputs.push(outcome.output);
          }
          if (outcome.failed) {
            throw new Error(outcome.error ?? `步骤 ${step.name} 执行失败`);
          }
        }

        await this.updateTaskStatus(taskId, 'completed', {
          output: { steps: stepOutputs, stepCount: steps.length },
        });
        await this.addTaskLog(taskId, 'state_change', 'info', 'Worker 任务处理完成');
        await this.notifyLifecycle(taskId, 'completed');
        return { success: true, taskId };
      }

      const capResult = await this.executionClient.executeCapability(taskId);
      if (capResult.needConfirmation) {
        await this.updateTaskStatus(taskId, 'pending_confirm');
        await this.addTaskLog(taskId, 'confirmation', 'warn', '任务等待人工确认', {
          approvalId: capResult.approvalId,
        });
        return {
          success: true,
          taskId,
          waitingConfirmation: true,
          approvalId: capResult.approvalId,
        };
      }

      if (!capResult.success) {
        throw new Error(capResult.error ?? '能力执行失败');
      }

      await this.updateTaskStatus(taskId, 'completed', {
        output: (capResult.output as Record<string, unknown>) ?? { message: '任务执行完成' },
      });
      await this.addTaskLog(taskId, 'state_change', 'info', 'Worker 任务处理完成');
      await this.notifyLifecycle(taskId, 'completed');
      return { success: true, taskId };
    } catch (error) {
      return this.handleTaskFailure(taskId, error);
    }
  }

  private async processStep(
    taskId: string,
    stepId: string,
    stepName: string,
    currentStatus: string,
  ): Promise<{
    failed?: boolean;
    error?: string;
    output?: unknown;
    waitingConfirmation?: boolean;
    approvalId?: string;
  }> {
    if (currentStatus === 'completed' || currentStatus === 'skipped') {
      this.logger.debug(`Step ${stepId} already ${currentStatus}, skipping`);
      return {};
    }

    if (currentStatus !== 'running') {
      await this.prisma.taskStep.update({
        where: { id: stepId },
        data: { status: 'running', startedAt: new Date() },
      });
    }

    await this.addTaskLog(taskId, 'state_change', 'info', `步骤开始: ${stepName}`, { stepId });

    const startTime = Date.now();

    try {
      const result = await this.executionClient.executeStep(taskId, stepId);

      if (result.needConfirmation) {
        await this.updateTaskStatus(taskId, 'pending_confirm');
        await this.addTaskLog(taskId, 'confirmation', 'warn',
          `步骤等待人工确认: ${result.toolName ?? stepName}`, {
            stepId,
            approvalId: result.approvalId,
          });
        return {
          waitingConfirmation: true,
          approvalId: result.approvalId,
        };
      }

      const durationMs = result.durationMs ?? Date.now() - startTime;

      if (!result.success) {
        await this.prisma.taskStep.update({
          where: { id: stepId },
          data: {
            status: 'failed',
            completedAt: new Date(),
            durationMs,
            failReason: result.error ?? '未知错误',
          },
        });
        await this.addTaskLog(taskId, 'error', 'error',
          `步骤失败: ${stepName} — ${result.error}`, { stepId });
        return { failed: true, error: result.error };
      }

      await this.prisma.taskStep.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs,
          output: (result.output as InputJsonValue) ?? Prisma.JsonNull,
        },
      });

      await this.addTaskLog(taskId, 'state_change', 'info', `步骤完成: ${stepName}`, {
        stepId,
        durationMs,
        toolName: result.toolName,
      });

      return { output: result.output };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      await this.prisma.taskStep.update({
        where: { id: stepId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          durationMs,
          failReason: errMsg,
        },
      });

      await this.addTaskLog(taskId, 'error', 'error', `步骤失败: ${stepName} — ${errMsg}`, {
        stepId,
      });

      throw error;
    }
  }

  private async handleTaskFailure(
    taskId: string,
    error: unknown,
  ): Promise<Record<string, unknown>> {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;

    this.logger.error(`Task ${taskId} failed: ${errMsg}`, errStack);

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { retryCount: { increment: 1 } },
      select: { retryCount: true, maxRetries: true },
    });

    const finalStatus: TaskStatus =
      updated.retryCount >= updated.maxRetries ? 'failed' : 'pending';

    await this.updateTaskStatus(taskId, finalStatus, { failReason: errMsg });
    await this.addTaskLog(taskId, 'error', 'error', `任务执行异常: ${errMsg}`, {
      stack: errStack,
      retryCount: updated.retryCount,
      maxRetries: updated.maxRetries,
    });

    if (finalStatus === 'pending') {
      await this.addTaskLog(taskId, 'retry', 'warn',
        `任务将重试 (${updated.retryCount}/${updated.maxRetries})`);
      throw error;
    }

    await this.notifyLifecycle(taskId, 'failed', errMsg);
    return { success: false, taskId, error: errMsg };
  }

  /** 经 server 入队异步通知（失败不阻断任务状态） */
  private async notifyLifecycle(
    taskId: string,
    event: 'completed' | 'failed',
    errorMessage?: string,
  ) {
    try {
      if (event === 'completed') {
        await this.executionClient.notifyTaskCompleted(taskId);
      } else {
        await this.executionClient.notifyTaskFailed(taskId, errorMessage);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Lifecycle notification enqueue failed for ${taskId}: ${msg}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<TaskJobPayload>, error: Error) {
    this.logger.error(
      `Job ${job.id} for task ${job.data.taskId} failed: ${error.message}`,
      error.stack,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<TaskJobPayload>) {
    this.logger.log(`Job ${job.id} for task ${job.data.taskId} completed`);
  }

  private async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    extra?: { output?: Record<string, unknown>; failReason?: string },
  ) {
    const data: Prisma.TaskUpdateInput = { status };
    if (status === 'running') data.startedAt = new Date();
    if (['completed', 'failed', 'cancelled', 'timeout'].includes(status))
      data.completedAt = new Date();
    if (extra?.output) data.output = extra.output as InputJsonValue;
    if (extra?.failReason) data.failReason = extra.failReason;
    if (status === 'completed' || status === 'failed') data.currentNode = null;

    await this.prisma.task.update({ where: { id: taskId }, data });
  }

  private async addTaskLog(
    taskId: string,
    type: string,
    level: string,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    await this.prisma.taskLog.create({
      data: {
        taskId,
        type: type as any,
        level: level as any,
        message,
        detail: (detail as InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }
}
