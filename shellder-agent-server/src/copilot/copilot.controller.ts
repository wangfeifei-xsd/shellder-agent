import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Logger,
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
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service';
import { SseEvent } from '../agent-runtime/agent-runtime.types';
import { SseEmitterService } from '../agent-runtime/sse-emitter.service';
import { ApprovalRuntimeService } from '../approval/approval-runtime.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeProxyService } from '../knowledge/knowledge-proxy.service';
import { OpenApiAppService } from '../openapi/openapi-app.service';
import { OpenApiCallLogService } from '../openapi/openapi-call-log.service';
import { CopilotAuthService, CopilotJwtPayload } from './copilot-auth.service';
import { CopilotConfigService } from './copilot-config.service';
import { CreateCopilotSessionDto, UpdateCopilotSessionDto } from './dto/copilot-session.dto';
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
@RequireMenu('copilot')
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
 * Copilot 对外 BFF（嵌入页使用，换票后用 Copilot JWT 鉴权）。
 * 会话/消息/SSE/确认/任务委托 AgentRuntimeService + ApprovalRuntimeService，
 * 与 OpenAPI 行为对齐，鉴权独立（Copilot JWT）。
 * 路径前缀：/copilot/v1
 */
@Controller('copilot/v1')
@Public()
export class CopilotWidgetController {
  private readonly logger = new Logger(CopilotWidgetController.name);

  constructor(
    private readonly authService: CopilotAuthService,
    private readonly appService: OpenApiAppService,
    private readonly callLogService: OpenApiCallLogService,
    private readonly prisma: PrismaService,
    private readonly approvalRuntime: ApprovalRuntimeService,
    private readonly runtimeService: AgentRuntimeService,
    private readonly sseEmitter: SseEmitterService,
    private readonly knowledgeProxy: KnowledgeProxyService,
  ) {}

  /** POST /copilot/v1/auth/token — 换票接口 */
  @Post('auth/token')
  async token(@Body() dto: CopilotTokenExchangeDto, @Req() req: Request) {
    const start = Date.now();
    const app = await this.appService.findByClientId(dto.clientId);
    const appId = app?.id ?? null;
    try {
      const result = await this.authService.exchangeToken(dto);
      await this.logCall(
        req,
        appId,
        'POST',
        '/copilot/v1/auth/token',
        200,
        'success',
        Date.now() - start,
        undefined,
        result.tenantId,
      );
      return result;
    } catch (err: any) {
      await this.logCall(
        req,
        appId,
        'POST',
        '/copilot/v1/auth/token',
        err.status ?? 500,
        'failed',
        Date.now() - start,
        err.message,
      );
      throw err;
    }
  }

  /** POST /copilot/v1/sessions — 创建 Copilot 会话 */
  @Post('sessions')
  async createSession(
    @Headers('authorization') authHeader: string,
    @Body() body: CreateCopilotSessionDto,
    @Req() req: Request,
  ) {
    const start = Date.now();
    const payload = this.extractPayload(authHeader);
    try {
      const principalContext = this.authService.snapshotPrincipalContext(payload);

      const session = await this.prisma.session.create({
        data: {
          tenantId: payload.tenantId,
          userId: payload.sub,
          title: body.title ?? null,
          capabilityType: body.capabilityType,
          principalContext: (principalContext ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });

      await this.logCall(
        req,
        payload.appId,
        'POST',
        '/copilot/v1/sessions',
        201,
        'success',
        Date.now() - start,
        undefined,
        payload.tenantId,
      );
      return {
        id: session.id,
        tenantId: session.tenantId,
        title: session.title,
        status: session.status,
        capabilityType: session.capabilityType,
        createdAt: session.createdAt,
      };
    } catch (err: any) {
      await this.logCall(
        req,
        payload.appId,
        'POST',
        '/copilot/v1/sessions',
        err.status ?? 500,
        'failed',
        Date.now() - start,
        err.message,
        payload.tenantId,
      );
      throw err;
    }
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

  /** GET /copilot/v1/sessions/:id — 获取会话详情、消息与关联任务 */
  @Get('sessions/:id')
  async getSession(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
  ) {
    const payload = this.extractPayload(authHeader);
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session || session.tenantId !== payload.tenantId || session.userId !== payload.sub) {
      throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
    }

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
      id: session.id,
      title: session.title,
      status: session.status,
      capabilityType: session.capabilityType,
      summary: session.summary,
      createdAt: session.createdAt,
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

  /** PATCH /copilot/v1/sessions/:id — 更新会话（如重命名） */
  @Patch('sessions/:id')
  async updateSession(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
    @Body() body: UpdateCopilotSessionDto,
  ) {
    const payload = this.extractPayload(authHeader);
    const session = await this.prisma.session.findUnique({ where: { id } });

    if (!session || session.tenantId !== payload.tenantId || session.userId !== payload.sub) {
      throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
    }

    if (body.title === undefined) {
      return {
        id: session.id,
        title: session.title,
        status: session.status,
        capabilityType: session.capabilityType,
        summary: session.summary,
        lastMessageAt: session.lastMessageAt,
        createdAt: session.createdAt,
      };
    }

    const updated = await this.prisma.session.update({
      where: { id },
      data: { title: body.title.trim() || null },
    });

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      capabilityType: updated.capabilityType,
      summary: updated.summary,
      lastMessageAt: updated.lastMessageAt,
      createdAt: updated.createdAt,
    };
  }

  /** DELETE /copilot/v1/sessions/:id — 删除历史会话（消息、任务、关联审批一并清理） */
  @Delete('sessions/:id')
  async deleteSession(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
  ) {
    const payload = this.extractPayload(authHeader);
    const session = await this.prisma.session.findUnique({ where: { id } });

    if (!session || session.tenantId !== payload.tenantId || session.userId !== payload.sub) {
      throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
    }

    const messageIds = (
      await this.prisma.message.findMany({
        where: { sessionId: id },
        select: { id: true },
      })
    ).map((m) => m.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { sessionId: id } });
      await tx.approval.deleteMany({
        where: {
          OR: [
            { sessionId: id },
            ...(messageIds.length > 0
              ? [{ messageId: { in: messageIds } }]
              : []),
          ],
        },
      });
      await tx.session.delete({ where: { id } });
    });

    return { id };
  }

  /**
   * POST /copilot/v1/sessions/:id/messages — 发送消息并触发 Agent Runtime 编排
   * mode=stream（默认）时请先建立 SSE 连接。
   */
  @Post('sessions/:id/messages')
  async sendMessage(
    @Headers('authorization') authHeader: string,
    @Param('id') sessionId: string,
    @Body() body: { content: string; mode?: 'sync' | 'stream' },
    @Req() req: Request,
  ) {
    const start = Date.now();
    const payload = this.extractPayload(authHeader);
    try {
      const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

      if (!session || session.tenantId !== payload.tenantId || session.userId !== payload.sub) {
        throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
      }

      const result = await this.runtimeService.sendMessage(
        this.toRuntimeUser(payload),
        sessionId,
        {
          content: body.content,
          mode: body.mode ?? 'stream',
        },
      );

      await this.logCall(
        req,
        payload.appId,
        'POST',
        `/copilot/v1/sessions/${sessionId}/messages`,
        201,
        'success',
        Date.now() - start,
        undefined,
        session.tenantId,
      );
      return result;
    } catch (err: any) {
      await this.logCall(
        req,
        payload.appId,
        'POST',
        `/copilot/v1/sessions/${sessionId}/messages`,
        err.status ?? 500,
        'failed',
        Date.now() - start,
        err.message,
        payload.tenantId,
      );
      throw err;
    }
  }

  /**
   * GET /copilot/v1/sessions/:id/stream — SSE 流式结果订阅
   * EventSource 无法携带 Authorization，支持 ?token= Copilot JWT。
   */
  @Get('sessions/:id/stream')
  async streamSession(
    @Headers('authorization') authHeader: string,
    @Query('token') queryToken: string | undefined,
    @Param('id') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const start = Date.now();
    let payload: CopilotJwtPayload;
    try {
      payload = this.extractPayload(authHeader, queryToken);
    } catch (err: any) {
      res.status(err.status ?? 403).json(err.response ?? { code: 'COPILOT_UNAUTHENTICATED', message: '缺少 Copilot Token' });
      return;
    }

    try {
      const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

      if (!session || session.tenantId !== payload.tenantId || session.userId !== payload.sub) {
        res.status(403).json({ code: 'SESSION_NOT_FOUND', message: '会话不存在' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');

      this.writeSseEvent(res, 'session.connected', {
        sessionId,
        status: session.status,
      });

      const messages = await this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { seq: 'asc' },
      });
      for (const msg of messages) {
        this.writeSseEvent(res, 'message', {
          id: msg.id,
          role: msg.role,
          messageType: msg.type,
          content: msg.content,
          seq: msg.seq,
          createdAt: msg.createdAt,
        });
      }

      this.writeSseEvent(res, 'session.snapshot_end', { status: session.status });

      const unsubscribe = this.sseEmitter.subscribe(sessionId, (event: SseEvent) => {
        this.writeSseEvent(res, event.event, event.data);
      });

      await this.logCall(
        req,
        payload.appId,
        'GET',
        `/copilot/v1/sessions/${sessionId}/stream`,
        200,
        'success',
        Date.now() - start,
        undefined,
        session.tenantId,
      );

      const keepAlive = setInterval(() => {
        res.write(`:keepalive\n\n`);
      }, 15000);

      req.on('close', () => {
        this.logger.debug(`Copilot SSE 客户端断开 session=${sessionId}`);
        clearInterval(keepAlive);
        unsubscribe();
        res.end();
      });
    } catch (err: any) {
      await this.logCall(
        req,
        payload.appId,
        'GET',
        `/copilot/v1/sessions/${sessionId}/stream`,
        err.status ?? 500,
        'failed',
        Date.now() - start,
        err.message,
        payload.tenantId,
      );
      throw err;
    }
  }

  /** GET /copilot/v1/confirmations — 当前租户待确认列表 */
  @Get('confirmations')
  async listConfirmations(
    @Headers('authorization') authHeader: string,
    @Query('status') status?: string,
  ) {
    const payload = this.extractPayload(authHeader);

    const where: Record<string, unknown> = { tenantId: payload.tenantId };
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

    const result = await this.approvalRuntime.reviewByCopilot(
      payload.tenantId,
      id,
      body.action,
      body.opinion,
      { id: payload.sub, name: payload.appName },
    );

    return {
      id: result.approval.id,
      status: result.approval.status,
      opinion: result.approval.opinion,
      reviewedAt: result.approval.reviewedAt,
      resumed: result.resumed,
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

  /** GET /copilot/v1/media/:code — 读取问答 merged_media 对应二进制资源 */
  @Get('media/:code')
  async getMedia(
    @Headers('authorization') authHeader: string,
    @Query('token') queryToken: string | undefined,
    @Param('code') code: string,
    @Res() res: Response,
  ) {
    const payload = this.extractPayload(authHeader, queryToken);
    const user = this.toRuntimeUser(payload);
    const result = await this.knowledgeProxy.downloadMedia(user, payload.tenantId, code);
    res.setHeader('Content-Type', result.contentType);
    if (result.contentDisposition) {
      res.setHeader('Content-Disposition', result.contentDisposition);
    }
    res.send(result.buffer);
  }

  /** GET /copilot/v1/docs — 接口清单（供管理端/集成方查阅） */
  @Get('docs')
  apiDocs() {
    return {
      title: 'shellder-agent Copilot API',
      version: 'v1',
      baseUrl: '/copilot/v1',
      strategy: 'BFF 薄层，会话/消息/SSE/确认/任务委托 AgentRuntimeService（与 OpenAPI 对齐）',
      endpoints: [
        { method: 'POST', path: '/auth/token', description: '换票，获取 Copilot JWT', auth: 'Client ID + Client Secret' },
        { method: 'POST', path: '/sessions', description: '创建会话（capabilityType 必填，手动选择）', auth: 'Bearer Copilot JWT' },
        { method: 'GET', path: '/sessions', description: '历史会话列表', auth: 'Bearer Copilot JWT' },
        { method: 'GET', path: '/sessions/:id', description: '会话详情（消息 + 任务）', auth: 'Bearer Copilot JWT' },
        { method: 'PATCH', path: '/sessions/:id', description: '更新会话（如重命名）', auth: 'Bearer Copilot JWT' },
        { method: 'DELETE', path: '/sessions/:id', description: '删除历史会话', auth: 'Bearer Copilot JWT' },
        { method: 'POST', path: '/sessions/:id/messages', description: '发送消息并触发 Runtime（mode=stream|sync）', auth: 'Bearer Copilot JWT' },
        { method: 'GET', path: '/sessions/:id/stream', description: 'SSE 订阅（?token= 供 EventSource）', auth: 'Bearer 或 ?token=' },
        { method: 'GET', path: '/confirmations', description: '待确认列表', auth: 'Bearer Copilot JWT' },
        { method: 'POST', path: '/confirmations/:id', description: '确认/驳回', auth: 'Bearer Copilot JWT' },
        { method: 'GET', path: '/tasks/:id', description: '任务状态与步骤进度', auth: 'Bearer Copilot JWT' },
        { method: 'GET', path: '/media/:code', description: '读取问答 merged_media 二进制资源', auth: 'Bearer 或 ?token=' },
      ],
    };
  }

  private toRuntimeUser(payload: CopilotJwtPayload): AuthUser {
    return {
      id: payload.sub,
      username: payload.appName,
      roles: ['copilot'],
      tenantIds: [payload.tenantId],
    };
  }

  private writeSseEvent(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private extractPayload(authHeader?: string, queryToken?: string): CopilotJwtPayload {
    const token = this.resolveToken(authHeader, queryToken);
    return this.authService.verifyCopilotToken(token);
  }

  private resolveToken(authHeader?: string, queryToken?: string): string {
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    if (queryToken) {
      return queryToken;
    }
    throw new ForbiddenException({
      code: 'COPILOT_UNAUTHENTICATED',
      message: '缺少 Copilot Token',
    });
  }

  private async logCall(
    req: Request,
    appId: string | null,
    method: string,
    path: string,
    statusCode: number,
    status: 'success' | 'failed' | 'rate_limited',
    durationMs: number,
    errorMessage?: string,
    tenantId?: string,
  ) {
    if (!appId) return;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    await this.callLogService.log({
      appId,
      tenantId,
      method,
      path,
      statusCode,
      status,
      ip,
      durationMs,
      errorMessage,
    }).catch(() => {});
  }
}
