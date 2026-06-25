import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { applicationProperties } from '@shellder/config';
import { Queue } from 'bullmq';
import {
  DEFAULT_NOTIFICATION_TEMPLATE_KEYS,
  NOTIFICATION_QUEUE,
  NotificationEventType,
  NotificationJobPayload,
} from './job-queue.constants';

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly queue: Queue<NotificationJobPayload>,
  ) {}

  async enqueue(payload: NotificationJobPayload): Promise<string | undefined> {
    const templateKey =
      payload.templateKey ||
      DEFAULT_NOTIFICATION_TEMPLATE_KEYS[payload.type];

    const jobId = this.buildJobId(payload);
    const job = await this.queue.add(
      'send-notification',
      { ...payload, templateKey },
      {
        jobId,
        attempts: applicationProperties.get().app.notification.queueAttempts,
        backoff: {
          type: 'exponential',
          delay: applicationProperties.get().app.notification.queueBackoffDelayMs,
        },
        removeOnComplete: { count: 2000 },
        removeOnFail: { count: 5000 },
      },
    );

    this.logger.log(
      `Notification enqueued type=${payload.type} tenant=${payload.tenantId} job=${job.id}`,
    );
    return job.id;
  }

  async enqueueTaskCompleted(
    tenantId: string,
    taskId: string,
    variables: Record<string, string>,
  ) {
    return this.enqueue({
      type: 'task_completed',
      tenantId,
      templateKey: DEFAULT_NOTIFICATION_TEMPLATE_KEYS.task_completed,
      variables,
      taskId,
    });
  }

  async enqueueApprovalPending(
    tenantId: string,
    approvalId: string,
    variables: Record<string, string>,
    taskId?: string,
  ) {
    return this.enqueue({
      type: 'approval_pending',
      tenantId,
      templateKey: DEFAULT_NOTIFICATION_TEMPLATE_KEYS.approval_pending,
      variables,
      approvalId,
      taskId,
    });
  }

  async enqueueError(
    tenantId: string,
    variables: Record<string, string>,
    taskId?: string,
  ) {
    return this.enqueue({
      type: 'error',
      tenantId,
      templateKey: DEFAULT_NOTIFICATION_TEMPLATE_KEYS.error,
      variables,
      taskId,
    });
  }

  private buildJobId(payload: NotificationJobPayload): string | undefined {
    // BullMQ custom jobId 不允许包含 ':'，使用 '-' 分隔以保证幂等
    if (payload.taskId) {
      return `notify-${payload.type}-${payload.taskId}`;
    }
    if (payload.approvalId) {
      return `notify-${payload.type}-approval-${payload.approvalId}`;
    }
    return undefined;
  }
}
