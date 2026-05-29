import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageType, Prisma, Session } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateSessionDto } from './dto/create-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  // ── 创建 ───────────────────────────────────────────────────

  async create(user: AuthUser, dto: CreateSessionDto) {
    await this.assertTenantAccess(user, dto.tenantId);
    await this.assertTenantEnabled(dto.tenantId);

    const session = await this.prisma.session.create({
      data: {
        tenantId: dto.tenantId,
        userId: user.id,
        title: dto.title ?? null,
        capabilityType: dto.capabilityType ?? null,
      },
    });
    return this.toView(session);
  }

  // ── 列表（§1.2 会话列表） ──────────────────────────────────

  async findMany(user: AuthUser, query: QuerySessionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SessionWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.userId) where.userId = query.userId;
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
        { summary: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((s) => this.toView(s)), total, page, pageSize };
  }

  // ── 详情（含消息 + 关联任务，Phase 16 增强） ──────────────────

  async findOne(user: AuthUser, id: string) {
    const session = await this.getOrThrow(id);
    await this.assertTenantAccess(user, session.tenantId);

    const [messages, tasks] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where: { sessionId: id },
        orderBy: { seq: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          capabilityType: true,
          currentNode: true,
          createdAt: true,
          completedAt: true,
        },
      }),
    ]);

    return {
      ...this.toView(session),
      messages: messages.map((m) => ({
        id: m.id,
        type: m.type,
        role: m.role,
        content: m.content,
        seq: m.seq,
        createdAt: m.createdAt,
      })),
      tasks,
    };
  }

  // ── 消息记录列表（§1.2 消息记录，Phase 16） ──────────────────

  async listMessages(
    user: AuthUser,
    sessionId: string,
    query: { page?: number; pageSize?: number; type?: MessageType },
  ) {
    const session = await this.getOrThrow(sessionId);
    await this.assertTenantAccess(user, session.tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.MessageWhereInput = { sessionId };
    if (query.type) where.type = query.type;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where,
        orderBy: { seq: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        type: m.type,
        role: m.role,
        content: m.content,
        seq: m.seq,
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ── 创建调试会话（§1.2 调试台，Phase 16） ──────────────────

  async createDebugSession(
    user: AuthUser,
    dto: { tenantId: string; scenario?: string; simulateUserId?: string },
  ) {
    await this.assertTenantAccess(user, dto.tenantId);
    await this.assertTenantEnabled(dto.tenantId);

    const debugTitle = dto.scenario
      ? `[调试] ${dto.scenario}`
      : `[调试] ${new Date().toLocaleString('zh-CN')}`;

    const session = await this.prisma.session.create({
      data: {
        tenantId: dto.tenantId,
        userId: dto.simulateUserId ?? user.id,
        title: debugTitle,
      },
    });

    return {
      ...this.toView(session),
      isDebug: true,
    };
  }

  // ── 更新（内部调用为主，供 12 Agent Runtime 使用） ──────────

  async update(user: AuthUser, id: string, dto: UpdateSessionDto) {
    const session = await this.getOrThrow(id);
    await this.assertTenantAccess(user, session.tenantId);

    const data: Prisma.SessionUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.capabilityType !== undefined) data.capabilityType = dto.capabilityType;
    if (dto.summary !== undefined) data.summary = dto.summary;
    if (dto.hasTask !== undefined) data.hasTask = dto.hasTask;
    if (dto.hasConfirmation !== undefined) data.hasConfirmation = dto.hasConfirmation;

    const updated = await this.prisma.session.update({ where: { id }, data });
    return this.toView(updated);
  }

  // ── 上下文装配（供 12 Agent Runtime 调用，验收标准 3） ──────

  async getContext(user: AuthUser, id: string, limit: number) {
    const session = await this.getOrThrow(id);
    await this.assertTenantAccess(user, session.tenantId);

    const messages = await this.prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { seq: 'desc' },
      take: limit,
    });

    return {
      sessionId: session.id,
      tenantId: session.tenantId,
      userId: session.userId,
      title: session.title,
      status: session.status,
      capabilityType: session.capabilityType,
      summary: session.summary,
      messages: messages.reverse().map((m) => ({
        id: m.id,
        type: m.type,
        role: m.role,
        content: m.content,
        seq: m.seq,
        createdAt: m.createdAt,
      })),
    };
  }

  // ── 隔离与查询辅助 ────────────────────────────────────────

  async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的会话访问权限',
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
        message: '该租户已禁用，不可创建会话',
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

  async getOrThrow(id: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `会话不存在：${id}`,
      });
    }
    return session;
  }

  private toView(session: Session) {
    return {
      id: session.id,
      tenantId: session.tenantId,
      userId: session.userId,
      title: session.title,
      status: session.status,
      capabilityType: session.capabilityType,
      summary: session.summary,
      hasTask: session.hasTask,
      hasConfirmation: session.hasConfirmation,
      lastMessageAt: session.lastMessageAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
