import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PLACEHOLDER_QUEUE } from '../queue/queue.constants';

@Injectable()
export class HealthService {
  constructor(
    @InjectQueue(PLACEHOLDER_QUEUE) private readonly placeholderQueue: Queue,
  ) {}

  async check() {
    await this.placeholderQueue.getJobCounts();
    return {
      status: 'ok',
      service: 'shellder-job-worker',
      redis: 'connected',
      queues: [PLACEHOLDER_QUEUE],
    };
  }
}
