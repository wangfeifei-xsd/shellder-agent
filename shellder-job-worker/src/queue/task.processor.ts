import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TASK_QUEUE } from './queue.constants';

export interface TaskJobPayload {
  taskId: string;
  tenantId: string;
}

/**
 * 任务处理器（架构 §6.3 / §4.11）。
 * 消费 TASK_QUEUE 队列，驱动任务执行状态机。
 * V1 阶段实现状态推进框架；具体业务能力执行由 12-Agent Runtime / 13-四类能力注入。
 */
@Processor(TASK_QUEUE, {
  concurrency: 5,
})
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(private readonly prisma: PrismaService) {
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

    if (task.status !== 'pending') {
      this.logger.warn(`Task ${taskId} status is ${task.status}, expected pending — skipping`);
      return { skipped: true, reason: `unexpected_status_${task.status}` };
    }

    await this.updateTaskStatus(taskId, 'running');
    await this.addTaskLog(taskId, 'state_change', 'info', 'Worker 开始处理任务');

    try {
      const steps = await this.prisma.taskStep.findMany({
        where: { taskId },
        orderBy: { seq: 'asc' },
      });

      if (steps.length > 0) {
        for (const step of steps) {
          await this.processStep(taskId, step.id, step.name);
        }
      } else {
        await this.addTaskLog(taskId, 'custom', 'info',
          '任务无预定义步骤，执行默认处理逻辑（12-Agent Runtime 注入后替换）');
      }

      await this.updateTaskStatus(taskId, 'completed', {
        output: { message: '任务执行完成' },
      });
      await this.addTaskLog(taskId, 'state_change', 'info', 'Worker 任务处理完成');

      return { success: true, taskId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Task ${taskId} failed: ${errMsg}`, errStack);

      const updated = await this.prisma.task.update({
        where: { id: taskId },
        data: {
          retryCount: { increment: 1 },
        },
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
        throw error;
      }

      return { success: false, taskId, error: errMsg };
    }
  }

  private async processStep(taskId: string, stepId: string, stepName: string) {
    await this.prisma.taskStep.update({
      where: { id: stepId },
      data: { status: 'running', startedAt: new Date() },
    });

    await this.addTaskLog(taskId, 'state_change', 'info', `步骤开始: ${stepName}`, {
      stepId,
    });

    const startTime = Date.now();

    try {
      // V1: 具体步骤执行逻辑由 12-Agent Runtime / 13-四类能力注入
      await this.prisma.taskStep.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
        },
      });

      await this.addTaskLog(taskId, 'state_change', 'info', `步骤完成: ${stepName}`, {
        stepId,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      await this.prisma.taskStep.update({
        where: { id: stepId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          failReason: errMsg,
        },
      });

      await this.addTaskLog(taskId, 'error', 'error', `步骤失败: ${stepName} — ${errMsg}`, {
        stepId,
      });

      throw error;
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

  // ── helpers ─────────────────────────────────────────────────

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
