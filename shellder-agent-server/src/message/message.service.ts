import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Message, MessageRole, MessageType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessageDto } from './dto/query-message.dto';

const DEFAULT_ROLE: Record<MessageType, MessageRole> = {
  user: 'user',
  system: 'assistant',
  tool: 'tool',
  confirmation: 'system',
};

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  /**
   * 追加消息到会话。
   * 自动递增 seq；同时更新 Session.lastMessageAt。
   */
  async create(user: AuthUser, dto: CreateMessageDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `会话不存在：${dto.sessionId}`,
      });
    }
    await this.tenantScope.assertAccess(user, session.tenantId, { resource: '消息' });

    const lastMsg = await this.prisma.message.findFirst({
      where: { sessionId: dto.sessionId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const nextSeq = (lastMsg?.seq ?? 0) + 1;

    const role = dto.role ?? DEFAULT_ROLE[dto.type];

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          sessionId: dto.sessionId,
          type: dto.type,
          role,
          content: dto.content as unknown as Prisma.InputJsonValue,
          seq: nextSeq,
        },
      }),
      this.prisma.session.update({
        where: { id: dto.sessionId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return this.toView(message);
  }

  /**
   * 按会话查询消息时间线（§4.2 / §1.2 消息记录）。
   */
  async findBySession(
    user: AuthUser,
    sessionId: string,
    query: QueryMessageDto,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `会话不存在：${sessionId}`,
      });
    }
    await this.tenantScope.assertAccess(user, session.tenantId, { resource: '消息' });

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
      items: rows.map((m) => this.toView(m)),
      total,
      page,
      pageSize,
    };
  }

  private toView(message: Message) {
    return {
      id: message.id,
      sessionId: message.sessionId,
      type: message.type,
      role: message.role,
      content: message.content,
      seq: message.seq,
      createdAt: message.createdAt,
    };
  }
}
