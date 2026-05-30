import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DOCUMENT_PROCESSING_QUEUE,
  NOTIFICATION_QUEUE,
  PLACEHOLDER_QUEUE,
  TASK_QUEUE,
  TASK_TIMEOUT_QUEUE,
} from '../queue/queue.constants';

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
      queues: [
        PLACEHOLDER_QUEUE,
        TASK_QUEUE,
        TASK_TIMEOUT_QUEUE,
        NOTIFICATION_QUEUE,
        DOCUMENT_PROCESSING_QUEUE,
      ],
    };
  }
}
