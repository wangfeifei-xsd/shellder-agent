import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';
import { NotificationSenderService } from '../notification/notification-sender.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_QUEUE,
  NotificationJobPayload,
} from './queue.constants';

/**
 * 异步通知队列：读取 notification_template + system_config，经通知连接器或 Mock 发送。
 * 幂等：同 taskId+type 已成功发送则跳过；Bull jobId 亦使用 notify:{type}:{taskId}。
 */
@Processor(NOTIFICATION_QUEUE, { concurrency: 3 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: NotificationSenderService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>): Promise<Record<string, unknown>> {
    const payload = job.data;
    this.logger.log(
      `Sending notification type=${payload.type} tenant=${payload.tenantId} job=${job.id}`,
    );

    if (payload.taskId && (await this.alreadySent(payload.taskId, payload.type))) {
      this.logger.log(`Notification already sent for task ${payload.taskId}, skipping`);
      return { skipped: true, reason: 'already_sent' };
    }

    const result = await this.sender.send(payload);
    const sendStatus = result.status;

    if (payload.taskId) {
      await this.prisma.taskLog.create({
        data: {
          taskId: payload.taskId,
          type: 'notification',
          level: sendStatus === 'failed' ? 'error' : 'info',
          message: `异步通知 ${payload.type}：${sendStatus}`,
          detail: {
            sendStatus,
            channel: result.channel,
            subject: result.subject,
            error: result.error,
            httpStatus: result.httpStatus,
            approvalId: payload.approvalId,
          } as InputJsonValue,
        },
      });
    }

    if (sendStatus === 'failed') {
      throw new Error(result.error ?? '通知发送失败');
    }

    return { success: true, sendStatus, channel: result.channel };
  }

  private async alreadySent(
    taskId: string,
    type: string,
  ): Promise<boolean> {
    const logs = await this.prisma.taskLog.findMany({
      where: { taskId, type: 'notification' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return logs.some((log) => {
      if (!log.message.includes(type)) return false;
      const detail = log.detail as { sendStatus?: string } | null;
      return detail?.sendStatus === 'sent' || detail?.sendStatus === 'mock';
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationJobPayload>, error: Error) {
    this.logger.error(
      `Notification job ${job.id} failed: ${error.message}`,
      error.stack,
    );
  }
}
