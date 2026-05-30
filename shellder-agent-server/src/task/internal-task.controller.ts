import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TaskLifecycleNotificationService } from '../job-queue/task-lifecycle-notification.service';
import { TaskExecutionService } from './task-execution.service';
import { WorkerTokenGuard } from './guards/worker-token.guard';

/**
 * job-worker 内网专用接口（方案 B）。
 * 仅校验 X-Worker-Token，不走 JWT / RBAC。
 */
@Controller('internal/tasks')
@UseGuards(WorkerTokenGuard)
export class InternalTaskController {
  constructor(
    private readonly taskExecution: TaskExecutionService,
    private readonly taskLifecycleNotification: TaskLifecycleNotificationService,
  ) {}

  /** 物化 workflow 步骤（若 task_step 为空则从 Workflow Tool 展开） */
  @Post(':taskId/prepare')
  @HttpCode(200)
  prepare(@Param('taskId') taskId: string) {
    return this.taskExecution.prepareTask(taskId);
  }

  /** 执行单个 task_step（Query / Action / Notification 子工具） */
  @Post(':taskId/steps/:stepId/execute')
  @HttpCode(200)
  executeStep(
    @Param('taskId') taskId: string,
    @Param('stepId') stepId: string,
  ) {
    return this.taskExecution.executeStep(taskId, stepId);
  }

  /** 无预定义步骤时，按 capabilityType 执行整能力（qa/query/action） */
  @Post(':taskId/execute-capability')
  @HttpCode(200)
  executeCapability(@Param('taskId') taskId: string) {
    return this.taskExecution.executeCapability(taskId);
  }

  /** worker 任务成功终态后触发异步通知 */
  @Post(':taskId/lifecycle/completed')
  @HttpCode(200)
  async lifecycleCompleted(@Param('taskId') taskId: string) {
    await this.taskLifecycleNotification.onTaskCompleted(taskId);
    return { ok: true, taskId };
  }

  /** worker 任务失败终态后触发异常通知 */
  @Post(':taskId/lifecycle/failed')
  @HttpCode(200)
  async lifecycleFailed(
    @Param('taskId') taskId: string,
    @Body() body?: { errorMessage?: string },
  ) {
    await this.taskLifecycleNotification.onTaskFailed(
      taskId,
      body?.errorMessage,
    );
    return { ok: true, taskId };
  }
}
