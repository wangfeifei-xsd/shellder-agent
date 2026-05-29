import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskLogDto } from './dto/query-task-log.dto';
import { TaskService } from './task.service';
import { TaskQueueService } from './task-queue.service';

/** 任务中心（功能清单 §1.3 / §4.3 Task）；归属「任务中心」菜单（task） */
@Controller('api/v1/tasks')
@RequireMenu('task')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly taskQueueService: TaskQueueService,
  ) {}

  @Post()
  @Audit({ action: 'task.create', module: 'task', targetType: 'task' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    const task = await this.taskService.create(user, dto);
    if (dto.type !== 'sync') {
      await this.taskQueueService.enqueue(task.id, task.tenantId);
    }
    return task;
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryTaskDto) {
    return this.taskService.findMany(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.taskService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'task.update', module: 'task', targetType: 'task' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.taskService.update(user, id, dto);
  }

  /** 长任务跟踪（§5.3 流程型/异步型进度） */
  @Get(':id/progress')
  progress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.taskService.getProgress(user, id);
  }

  /** 执行日志（§5.4 任务级日志） */
  @Get(':id/logs')
  logs(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: QueryTaskLogDto,
  ) {
    return this.taskService.getLogs(user, id, query);
  }
}
