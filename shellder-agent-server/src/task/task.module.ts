import { Module, forwardRef } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { AuditModule } from '../audit/audit.module';
import { BusinessCapabilityModule } from '../business-capability/business-capability.module';
import { JobQueueModule } from '../job-queue/job-queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ToolModule } from '../tool/tool.module';
import { InternalTaskController } from './internal-task.controller';
import { TaskController } from './task.controller';
import { TaskExecutionService } from './task-execution.service';
import { TaskQueueService } from './task-queue.service';
import { TaskService } from './task.service';
import { WorkerTokenGuard } from './guards/worker-token.guard';

/**
 * 任务中心模块（功能清单 §1.3 / §4.3 Task / §4.11 异步执行）。
 * - Task CRUD、状态推进、长任务跟踪、执行日志。
 * - 通过 BullMQ 将异步任务入队，由 shellder-job-worker 消费。
 * - 导出 TaskService / TaskQueueService 供 12-Agent Runtime 引用。
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ToolModule,
    forwardRef(() => ApprovalModule),
    BusinessCapabilityModule,
    JobQueueModule,
  ],
  controllers: [TaskController, InternalTaskController],
  providers: [
    TaskService,
    TaskQueueService,
    TaskExecutionService,
    WorkerTokenGuard,
  ],
  exports: [TaskService, TaskQueueService, TaskExecutionService],
})
export class TaskModule {}
