import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Task, TaskLog, TaskStatus, TaskStep } from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskLogDto } from './dto/query-task-log.dto';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  // ── 创建任务 ────────────────────────────────────────────────

  async create(user: AuthUser, dto: CreateTaskDto) {
    await this.assertTenantAccess(user, dto.tenantId);
    await this.assertTenantEnabled(dto.tenantId);

    const task = await this.prisma.task.create({
      data: {
        tenantId: dto.tenantId,
        sessionId: dto.sessionId ?? null,
        userId: user.id,
        title: dto.title ?? null,
        type: dto.type ?? 'async',
        capabilityType: dto.capabilityType ?? null,
        input: (dto.input as InputJsonValue) ?? Prisma.JsonNull,
        maxRetries: dto.maxRetries ?? 3,
        timeoutMs: dto.timeoutMs ?? 300000,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });

    await this.addLog(task.id, {
      type: 'state_change',
      level: 'info',
      message: `任务创建，初始状态: pending`,
    });

    return this.toView(task);
  }

  // ── 列表（§1.3 任务列表） ──────────────────────────────────

  async findMany(user: AuthUser, query: QueryTaskDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.TaskWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.userId) where.userId = query.userId;
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.capabilityType) where.capabilityType = query.capabilityType;
    if (query.startTime || query.endTime) {
      where.createdAt = {};
      if (query.startTime)
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.startTime);
      if (query.endTime)
        (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.endTime);
    }
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword } },
        { currentNode: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((t) => this.toView(t)), total, page, pageSize };
  }

  // ── 详情（含步骤） ──────────────────────────────────────────

  async findOne(user: AuthUser, id: string) {
    const task = await this.getOrThrow(id);
    await this.assertTenantAccess(user, task.tenantId);

    const steps = await this.prisma.taskStep.findMany({
      where: { taskId: id },
      orderBy: { seq: 'asc' },
    });

    return {
      ...this.toView(task),
      steps: steps.map((s) => this.stepToView(s)),
    };
  }

  // ── 状态推进（供内部调用 / Agent Runtime） ──────────────────

  async update(user: AuthUser, id: string, dto: UpdateTaskDto) {
    const task = await this.getOrThrow(id);
    await this.assertTenantAccess(user, task.tenantId);

    const data: Prisma.TaskUpdateInput = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'running' && !task.startedAt) {
        data.startedAt = new Date();
      }
      if (['completed', 'failed', 'cancelled', 'timeout'].includes(dto.status)) {
        data.completedAt = new Date();
      }
    }
    if (dto.currentNode !== undefined) data.currentNode = dto.currentNode;
    if (dto.output !== undefined) data.output = dto.output as InputJsonValue;
    if (dto.failReason !== undefined) data.failReason = dto.failReason;

    const updated = await this.prisma.task.update({ where: { id }, data });

    if (dto.status && dto.status !== task.status) {
      await this.addLog(task.id, {
        type: 'state_change',
        level: dto.status === 'failed' || dto.status === 'timeout' ? 'error' : 'info',
        message: `状态变更: ${task.status} → ${dto.status}`,
        detail: dto.failReason ? { failReason: dto.failReason } : undefined,
      });
    }

    return this.toView(updated);
  }

  // ── 长任务跟踪（§5.3 步骤进度） ───────────────────────────

  async getProgress(user: AuthUser, id: string) {
    const task = await this.getOrThrow(id);
    await this.assertTenantAccess(user, task.tenantId);

    const steps = await this.prisma.taskStep.findMany({
      where: { taskId: id },
      orderBy: { seq: 'asc' },
    });

    const completedSteps = steps.filter(
      (s) => s.status === 'completed' || s.status === 'skipped',
    );
    const currentStep = steps.find((s) => s.status === 'running');
    const remainingSteps = steps.filter((s) => s.status === 'pending');

    return {
      task: this.toView(task),
      totalSteps: steps.length,
      completedCount: completedSteps.length,
      currentStep: currentStep ? this.stepToView(currentStep) : null,
      remainingCount: remainingSteps.length,
      steps: steps.map((s) => this.stepToView(s)),
    };
  }

  // ── 执行日志（§5.4） ──────────────────────────────────────

  async getLogs(user: AuthUser, taskId: string, query: QueryTaskLogDto) {
    const task = await this.getOrThrow(taskId);
    await this.assertTenantAccess(user, task.tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.TaskLogWhereInput = { taskId };
    if (query.type) where.type = query.type;
    if (query.level) where.level = query.level;
    if (query.stepId) where.stepId = query.stepId;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.taskLog.count({ where }),
      this.prisma.taskLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((l) => this.logToView(l)),
      total,
      page,
      pageSize,
    };
  }

  // ── 日志写入（内部方法，供 Service / Worker 调用） ──────────

  async addLog(
    taskId: string,
    data: {
      type: TaskLog['type'];
      level?: TaskLog['level'];
      message: string;
      detail?: Record<string, unknown>;
      stepId?: string;
    },
  ) {
    return this.prisma.taskLog.create({
      data: {
        taskId,
        stepId: data.stepId ?? null,
        type: data.type,
        level: data.level ?? 'info',
        message: data.message,
        detail: (data.detail as InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  // ── 步骤管理（内部方法，供 Worker / Agent Runtime 调用） ────

  async addStep(
    taskId: string,
    data: {
      name: string;
      description?: string;
      toolName?: string;
      input?: Record<string, unknown>;
    },
  ) {
    const maxSeq = await this.prisma.taskStep.aggregate({
      where: { taskId },
      _max: { seq: true },
    });
    const nextSeq = (maxSeq._max.seq ?? -1) + 1;

    return this.prisma.taskStep.create({
      data: {
        taskId,
        seq: nextSeq,
        name: data.name,
        description: data.description ?? null,
        toolName: data.toolName ?? null,
        input: (data.input as InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  async updateStep(
    stepId: string,
    data: {
      status?: TaskStep['status'];
      output?: Record<string, unknown>;
      failReason?: string;
      durationMs?: number;
    },
  ) {
    const updateData: Prisma.TaskStepUpdateInput = {};
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'running') updateData.startedAt = new Date();
      if (['completed', 'failed', 'skipped'].includes(data.status))
        updateData.completedAt = new Date();
    }
    if (data.output !== undefined) updateData.output = data.output as InputJsonValue;
    if (data.failReason !== undefined) updateData.failReason = data.failReason;
    if (data.durationMs !== undefined) updateData.durationMs = data.durationMs;

    return this.prisma.taskStep.update({ where: { id: stepId }, data: updateData });
  }

  // ── 内部更新（无鉴权，供 Worker 进程使用） ─────────────────

  async internalUpdateStatus(
    taskId: string,
    status: TaskStatus,
    extra?: { output?: Record<string, unknown>; failReason?: string },
  ) {
    const data: Prisma.TaskUpdateInput = { status };
    if (status === 'running') data.startedAt = new Date();
    if (['completed', 'failed', 'cancelled', 'timeout'].includes(status))
      data.completedAt = new Date();
    if (extra?.output) data.output = extra.output as InputJsonValue;
    if (extra?.failReason) data.failReason = extra.failReason;

    const task = await this.prisma.task.update({ where: { id: taskId }, data });

    await this.addLog(taskId, {
      type: 'state_change',
      level: status === 'failed' || status === 'timeout' ? 'error' : 'info',
      message: `Worker 更新状态: → ${status}`,
      detail: extra?.failReason ? { failReason: extra.failReason } : undefined,
    });

    return task;
  }

  // ── 隔离与查询辅助 ────────────────────────────────────────

  private async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的任务访问权限',
      });
    }
  }

  private async assertTenantEnabled(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `租户不存在：${tenantId}`,
      });
    }
    if (tenant.status === 'disabled') {
      throw new ForbiddenException({
        code: 'TENANT_DISABLED',
        message: '该租户已禁用，不可创建任务',
      });
    }
  }

  private async resolveTenantFilter(
    user: AuthUser,
    requestedTenantId?: string,
  ): Promise<string | Prisma.StringFilter | undefined> {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) {
      return requestedTenantId || undefined;
    }
    const allowed = user.tenantIds ?? [];
    if (requestedTenantId && allowed.includes(requestedTenantId)) {
      return requestedTenantId;
    }
    return { in: allowed };
  }

  async getOrThrow(id: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: `任务不存在：${id}`,
      });
    }
    return task;
  }

  private toView(task: Task) {
    return {
      id: task.id,
      tenantId: task.tenantId,
      sessionId: task.sessionId,
      userId: task.userId,
      title: task.title,
      type: task.type,
      status: task.status,
      capabilityType: task.capabilityType,
      currentNode: task.currentNode,
      input: task.input,
      output: task.output,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
      timeoutMs: task.timeoutMs,
      failReason: task.failReason,
      jobId: task.jobId,
      scheduledAt: task.scheduledAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private stepToView(step: TaskStep) {
    return {
      id: step.id,
      taskId: step.taskId,
      seq: step.seq,
      name: step.name,
      description: step.description,
      status: step.status,
      input: step.input,
      output: step.output,
      toolName: step.toolName,
      failReason: step.failReason,
      durationMs: step.durationMs,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      createdAt: step.createdAt,
      updatedAt: step.updatedAt,
    };
  }

  private logToView(log: TaskLog) {
    return {
      id: log.id,
      taskId: log.taskId,
      stepId: log.stepId,
      type: log.type,
      level: log.level,
      message: log.message,
      detail: log.detail,
      createdAt: log.createdAt,
    };
  }
}
