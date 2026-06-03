import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TaskExecutionClient } from '../task/task-execution.client';
import {
  DOCUMENT_PROCESSING_QUEUE,
  NOTIFICATION_QUEUE,
  PLACEHOLDER_QUEUE,
  TASK_QUEUE,
  TASK_TIMEOUT_QUEUE,
} from './queue.constants';
import { DocumentProcessingProcessor } from './document-processing.processor';
import { NotificationProcessor } from './notification.processor';
import { NotificationSenderService } from '../notification/notification-sender.service';
import { WikiClientService } from '../wiki/wiki-client.service';
import { TenantScopeService } from '../wiki/tenant-scope.service';
import { PlaceholderProcessor } from './placeholder.processor';
import { TaskProcessor } from './task.processor';
import { TaskTimeoutProcessor } from './task-timeout.processor';
import { TaskTimeoutScheduler } from './task-timeout.scheduler';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: PLACEHOLDER_QUEUE },
      { name: TASK_QUEUE },
      { name: TASK_TIMEOUT_QUEUE },
      { name: NOTIFICATION_QUEUE },
      { name: DOCUMENT_PROCESSING_QUEUE },
    ),
  ],
  providers: [
    PlaceholderProcessor,
    TaskProcessor,
    TaskTimeoutProcessor,
    TaskTimeoutScheduler,
    NotificationProcessor,
    DocumentProcessingProcessor,
    NotificationSenderService,
    WikiClientService,
    TenantScopeService,
    TaskExecutionClient,
  ],
  exports: [BullModule],
})
export class QueueModule {}
