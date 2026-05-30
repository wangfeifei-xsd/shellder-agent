import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TASK_TIMEOUT_QUEUE } from './queue.constants';

/**
 * 定时超时检查（§4.10 定时任务 — 超时检查）。
 * 扫描 running 状态超时的 task 并标记为 timeout。
 */
@Processor(TASK_TIMEOUT_QUEUE)
export class TaskTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskTimeoutProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(
    job: Job,
  ): Promise<{ checked: number; timedOut: number; approvalTimedOut: number }> {
    this.logger.log('Running timeout check...');

    const runningTasks = await this.prisma.task.findMany({
      where: { status: 'running' },
      select: { id: true, startedAt: true, timeoutMs: true },
    });

    let timedOut = 0;
    const now = Date.now();

    for (const task of runningTasks) {
      if (!task.startedAt) continue;
      const elapsed = now - task.startedAt.getTime();
      if (elapsed > task.timeoutMs) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'timeout',
            completedAt: new Date(),
            failReason: `执行超时 (${elapsed}ms > ${task.timeoutMs}ms)`,
          },
        });

        await this.prisma.taskLog.create({
          data: {
            taskId: task.id,
            type: 'state_change',
            level: 'error',
            message: `任务超时: 已运行 ${elapsed}ms，超时阈值 ${task.timeoutMs}ms`,
            detail: Prisma.JsonNull,
          },
        });

        this.logger.warn(`Task ${task.id} timed out (${elapsed}ms > ${task.timeoutMs}ms)`);
        timedOut++;
      }
    }

    const approvalTimedOut = await this.markExpiredApprovals();

    this.logger.log(
      `Timeout check done: ${runningTasks.length} tasks checked, ${timedOut} task timed out, ${approvalTimedOut} approval timed out`,
    );
    return {
      checked: runningTasks.length,
      timedOut,
      approvalTimedOut,
    };
  }

  /**
   * 审批超时（执行计划 14 §4 / 09 job-worker）。
   */
  private async markExpiredApprovals(): Promise<number> {
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
            failReason: '审批超时未处理',
            completedAt: new Date(),
          },
        });
      }
    }

    return expired.length;
  }
}
