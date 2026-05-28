import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PLACEHOLDER_QUEUE } from './queue.constants';
import { PlaceholderProcessor } from './placeholder.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PLACEHOLDER_QUEUE,
    }),
  ],
  providers: [PlaceholderProcessor],
  exports: [BullModule],
})
export class QueueModule {}
