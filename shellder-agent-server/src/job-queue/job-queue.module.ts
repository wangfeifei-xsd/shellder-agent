import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  DOCUMENT_PROCESSING_QUEUE,
  NOTIFICATION_QUEUE,
  TASK_QUEUE,
  TASK_TIMEOUT_QUEUE,
} from './job-queue.constants';
import { DocumentProcessingQueueService } from './document-processing-queue.service';
import { NotificationQueueService } from './notification-queue.service';
import { TaskLifecycleNotificationService } from './task-lifecycle-notification.service';

/**
 * 异步队列入队（agent-server 侧）。
 * 消费由 shellder-job-worker 完成。
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        ...(process.env.REDIS_PASSWORD
          ? { password: process.env.REDIS_PASSWORD }
          : {}),
        maxRetriesPerRequest: null,
      },
    }),
    BullModule.registerQueue(
      { name: TASK_QUEUE },
      { name: TASK_TIMEOUT_QUEUE },
      { name: NOTIFICATION_QUEUE },
      { name: DOCUMENT_PROCESSING_QUEUE },
    ),
  ],
  providers: [
    NotificationQueueService,
    DocumentProcessingQueueService,
    TaskLifecycleNotificationService,
  ],
  exports: [
    NotificationQueueService,
    DocumentProcessingQueueService,
    TaskLifecycleNotificationService,
    BullModule,
  ],
})
export class JobQueueModule {}
