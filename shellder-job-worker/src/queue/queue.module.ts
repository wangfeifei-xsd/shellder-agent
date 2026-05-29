import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PLACEHOLDER_QUEUE, TASK_QUEUE, TASK_TIMEOUT_QUEUE } from './queue.constants';
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
    ),
  ],
  providers: [
    PlaceholderProcessor,
    TaskProcessor,
    TaskTimeoutProcessor,
    TaskTimeoutScheduler,
  ],
  exports: [BullModule],
})
export class QueueModule {}
