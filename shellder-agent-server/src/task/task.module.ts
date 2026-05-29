import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TASK_QUEUE } from './task-queue.constants';
import { TaskController } from './task.controller';
import { TaskQueueService } from './task-queue.service';
import { TaskService } from './task.service';

/**
 * 任务中心模块（功能清单 §1.3 / §4.3 Task / §4.11 异步执行）。
 * - Task CRUD、状态推进、长任务跟踪、执行日志。
 * - 通过 BullMQ 将异步任务入队，由 shellder-job-worker 消费。
 * - 导出 TaskService / TaskQueueService 供 12-Agent Runtime 引用。
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
    BullModule.registerQueue({ name: TASK_QUEUE }),
  ],
  controllers: [TaskController],
  providers: [TaskService, TaskQueueService],
  exports: [TaskService, TaskQueueService],
})
export class TaskModule {}
