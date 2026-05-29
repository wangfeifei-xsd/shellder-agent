import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { CopilotAuthService } from './copilot-auth.service';
import { CopilotConfigService } from './copilot-config.service';
import {
  CopilotTokenExchangeDto,
  CreateCopilotConfigDto,
  UpdateCopilotConfigDto,
} from './dto/copilot-config.dto';

/**
 * Copilot 管理接口（管理后台使用，需管理后台 JWT）
 * 路径前缀：/api/v1/copilot/configs
 */
@Controller('api/v1/copilot/configs')
export class CopilotConfigController {
  constructor(private readonly configService: CopilotConfigService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCopilotConfigDto) {
    return this.configService.create(user, dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthUser, @Query('tenantId') tenantId?: string) {
    return this.configService.findMany(user, tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.configService.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCopilotConfigDto,
  ) {
    return this.configService.update(user, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.configService.delete(user, id);
  }
}

/**
 * Copilot 对外接口（嵌入页使用，换票后用 Copilot JWT 鉴权）
 * 路径前缀：/copilot/v1
 */
@Controller('copilot/v1')
@Public()
export class CopilotWidgetController {
  constructor(
    private readonly authService: CopilotAuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** POST /copilot/v1/auth/token — 换票接口 */
  @Post('auth/token')
  async token(@Body() dto: CopilotTokenExchangeDto) {
    return this.authService.exchangeToken(dto);
  }

  /** POST /copilot/v1/sessions — 创建 Copilot 会话 */
  @Post('sessions')
  async createSession(
    @Headers('authorization') authHeader: string,
    @Body() body: { title?: string },
  ) {
    const payload = this.extractPayload(authHeader);

    const session = await this.prisma.session.create({
      data: {
        tenantId: payload.tenantId,
        userId: payload.sub,
        title: body.title ?? null,
      },
    });

    return {
      id: session.id,
      tenantId: session.tenantId,
      title: session.title,
      status: session.status,
      createdAt: session.createdAt,
    };
  }

  /** GET /copilot/v1/sessions — 历史会话列表 */
  @Get('sessions')
  async listSessions(
    @Headers('authorization') authHeader: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const payload = this.extractPayload(authHeader);
    const p = Number(page) || 1;
    const ps = Number(pageSize) || 20;

    const where = {
      tenantId: payload.tenantId,
      userId: payload.sub,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        skip: (p - 1) * ps,
        take: ps,
      }),
    ]);

    return {
      items: rows.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        capabilityType: s.capabilityType,
        summary: s.summary,
        lastMessageAt: s.lastMessageAt,
        createdAt: s.createdAt,
      })),
      total,
      page: p,
      pageSize: ps,
    };
  }

  /** GET /copilot/v1/sessions/:id — 获取会话详情与消息 */
  @Get('sessions/:id')
  async getSession(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
  ) {
    const payload = this.extractPayload(authHeader);
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { messages: { orderBy: { seq: 'asc' } } },
    });

    if (!session || session.tenantId !== payload.tenantId) {
      throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
    }

    return {
      id: session.id,
      title: session.title,
      status: session.status,
      capabilityType: session.capabilityType,
      summary: session.summary,
      createdAt: session.createdAt,
      messages: session.messages.map((m) => ({
        id: m.id,
        type: m.type,
        role: m.role,
        content: m.content,
        seq: m.seq,
        createdAt: m.createdAt,
      })),
    };
  }

  /** POST /copilot/v1/sessions/:id/messages — 发送消息 */
  @Post('sessions/:id/messages')
  async sendMessage(
    @Headers('authorization') authHeader: string,
    @Param('id') sessionId: string,
    @Body() body: { content: string },
  ) {
    const payload = this.extractPayload(authHeader);
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

    if (!session || session.tenantId !== payload.tenantId) {
      throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
    }

    const lastMsg = await this.prisma.message.findFirst({
      where: { sessionId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });

    const message = await this.prisma.message.create({
      data: {
        sessionId,
        type: 'user',
        role: 'user',
        content: { text: body.content },
        seq: (lastMsg?.seq ?? 0) + 1,
      },
    });

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastMessageAt: new Date() },
    });

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

  /** GET /copilot/v1/sessions/:id/stream — SSE 流式响应 */
  @Get('sessions/:id/stream')
  async streamSession(
    @Headers('authorization') authHeader: string,
    @Param('id') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const payload = this.extractPayload(authHeader);
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

    if (!session || session.tenantId !== payload.tenantId) {
      res.status(403).json({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(`data: ${JSON.stringify({ type: 'session.connected', sessionId, status: session.status })}\n\n`);

    const messages = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { seq: 'asc' },
    });
    for (const msg of messages) {
      res.write(`data: ${JSON.stringify({
        type: 'message',
        id: msg.id,
        role: msg.role,
        messageType: msg.type,
        content: msg.content,
        seq: msg.seq,
        createdAt: msg.createdAt,
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'session.snapshot_end', status: session.status })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(`:keepalive\n\n`);
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      res.end();
    });
  }

  /** GET /copilot/v1/confirmations — 当前租户待确认列表 */
  @Get('confirmations')
  async listConfirmations(
    @Headers('authorization') authHeader: string,
    @Query('status') status?: string,
  ) {
    const payload = this.extractPayload(authHeader);

    const where: any = { tenantId: payload.tenantId };
    if (status) where.status = status;

    const approvals = await this.prisma.approval.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return approvals.map((a) => ({
      id: a.id,
      sessionId: a.sessionId,
      taskId: a.taskId,
      actionType: a.actionType,
      actionSummary: a.actionSummary,
      riskLevel: a.riskLevel,
      impactScope: a.impactScope,
      status: a.status,
      createdAt: a.createdAt,
    }));
  }

  /** POST /copilot/v1/confirmations/:id — 提交确认/驳回 */
  @Post('confirmations/:id')
  async submitConfirmation(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; opinion?: string },
  ) {
    const payload = this.extractPayload(authHeader);
    const approval = await this.prisma.approval.findUnique({ where: { id } });

    if (!approval || approval.tenantId !== payload.tenantId) {
      throw new ForbiddenException({ code: 'APPROVAL_NOT_FOUND', message: '审批记录不存在' });
    }
    if (approval.status !== 'pending') {
      throw new ForbiddenException({
        code: 'APPROVAL_ALREADY_PROCESSED',
        message: `该审批已处理：${approval.status}`,
      });
    }

    const updated = await this.prisma.approval.update({
      where: { id },
      data: {
        status: body.action === 'approve' ? 'approved' : 'rejected',
        opinion: body.opinion ?? null,
        reviewerId: payload.sub,
        reviewerName: payload.appName,
        reviewedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      opinion: updated.opinion,
      reviewedAt: updated.reviewedAt,
    };
  }

  /** GET /copilot/v1/tasks/:id — 查询任务状态与进度 */
  @Get('tasks/:id')
  async getTask(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
  ) {
    const payload = this.extractPayload(authHeader);
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { steps: { orderBy: { seq: 'asc' } } },
    });

    if (!task || task.tenantId !== payload.tenantId) {
      throw new ForbiddenException({ code: 'TASK_NOT_FOUND', message: '任务不存在' });
    }

    return {
      id: task.id,
      sessionId: task.sessionId,
      title: task.title,
      type: task.type,
      status: task.status,
      capabilityType: task.capabilityType,
      currentNode: task.currentNode,
      output: task.output,
      failReason: task.failReason,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      steps: task.steps.map((s) => ({
        id: s.id,
        seq: s.seq,
        name: s.name,
        status: s.status,
        durationMs: s.durationMs,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
    };
  }

  private extractPayload(authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ForbiddenException({
        code: 'COPILOT_UNAUTHENTICATED',
        message: '缺少 Copilot Token',
      });
    }
    const token = authHeader.slice(7);
    return this.authService.verifyCopilotToken(token);
  }
}
