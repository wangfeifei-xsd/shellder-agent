import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TASK_TIMEOUT_QUEUE } from './queue.constants';

/**
 * 启动时注册超时检查重复 Job（每 60 秒一次）。
 * BullMQ repeatable jobs 内置去重，多实例不冲突。
 */
@Injectable()
export class TaskTimeoutScheduler implements OnModuleInit {
  private readonly logger = new Logger(TaskTimeoutScheduler.name);

  constructor(
    @InjectQueue(TASK_TIMEOUT_QUEUE)
    private readonly timeoutQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.timeoutQueue.upsertJobScheduler(
      'task-timeout-check',
      { every: 60_000 },
      { name: 'timeout-check' },
    );
    this.logger.log('Task timeout scheduler registered (every 60s)');
  }
}
