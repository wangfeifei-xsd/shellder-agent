import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PLACEHOLDER_QUEUE } from './queue.constants';

/** 阶段 01 占位消费者：no-op，后续阶段替换为真实任务处理 */
@Processor(PLACEHOLDER_QUEUE)
export class PlaceholderProcessor extends WorkerHost {
  private readonly logger = new Logger(PlaceholderProcessor.name);

  async process(job: Job<Record<string, never>>) {
    this.logger.debug(`Placeholder job ${job.id} — no-op`);
    return { ok: true };
  }
}
