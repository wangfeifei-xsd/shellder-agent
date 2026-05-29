import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TASK_QUEUE } from './task-queue.constants';

export interface TaskJobPayload {
  taskId: string;
  tenantId: string;
}

@Injectable()
export class TaskQueueService {
  private readonly logger = new Logger(TaskQueueService.name);

  constructor(
    @InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue<TaskJobPayload>,
    private readonly prisma: PrismaService,
  ) {}

  async enqueue(taskId: string, tenantId: string): Promise<string | undefined> {
    const job = await this.taskQueue.add(
      'process-task',
      { taskId, tenantId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );

    if (job.id) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { jobId: job.id },
      });
      this.logger.log(`Task ${taskId} enqueued as job ${job.id}`);
    }

    return job.id;
  }
}
