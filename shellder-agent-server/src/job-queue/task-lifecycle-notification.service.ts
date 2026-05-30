import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';

/**
 * 任务生命周期触发的异步通知（供 worker 内网回调或 server 内部调用）。
 */
@Injectable()
export class TaskLifecycleNotificationService {
  private readonly logger = new Logger(TaskLifecycleNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  async onTaskCompleted(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return;

    await this.notificationQueue.enqueueTaskCompleted(task.tenantId, taskId, {
      taskTitle: task.title ?? taskId,
      taskStatus: task.status,
      completedAt: (task.completedAt ?? new Date()).toISOString(),
      taskId,
    });
    this.logger.log(`Queued task_completed notification for ${taskId}`);
  }

  async onTaskFailed(taskId: string, errorMessage?: string): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return;

    await this.notificationQueue.enqueueError(task.tenantId, {
      errorType: 'task_failed',
      errorMessage: errorMessage ?? task.failReason ?? '任务执行失败',
      occurredAt: new Date().toISOString(),
      taskId,
      taskTitle: task.title ?? taskId,
    }, taskId);
    this.logger.log(`Queued error notification for failed task ${taskId}`);
  }
}
