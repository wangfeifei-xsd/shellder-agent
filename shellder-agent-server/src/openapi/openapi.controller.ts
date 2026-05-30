import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../auth/jwt.types';
import { ApprovalRuntimeService } from '../approval/approval-runtime.service';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service';
import { SseEvent } from '../agent-runtime/agent-runtime.types';
import { SseEmitterService } from '../agent-runtime/sse-emitter.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentApp } from './decorators/current-app.decorator';
import {
  OpenApiConfirmationDto,
  OpenApiCreateSessionDto,
  OpenApiSendMessageDto,
  OpenApiTokenDto,
} from './dto/openapi-auth.dto';
import { OpenApiAuthGuard } from './guards/openapi-auth.guard';
import { OpenApiAppContext } from './openapi-auth.types';
import { OpenApiAuthService } from './openapi-auth.service';
import { OpenApiCallLogService } from './openapi-call-log.service';

/**
 * OpenAPI 对外接口（功能清单 §3 / 执行计划 §2）
 * 路径前缀：/openapi/v1
 * 独立于管理后台 JWT，使用 OpenAPI 应用凭证鉴权。
 */
@Controller('openapi/v1')
@Public()
export class OpenApiController {
  private readonly logger = new Logger(OpenApiController.name);

  constructor(
    private readonly authService: OpenApiAuthService,
    private readonly prisma: PrismaService,
    private readonly callLogService: OpenApiCallLogService,
    private readonly runtimeService: AgentRuntimeService,
    private readonly approvalRuntime: ApprovalRuntimeService,
    private readonly sseEmitter: SseEmitterService,
  ) {}

  /** POST /openapi/v1/auth/token — 应用鉴权，换取 Token */
  @Post('auth/token')
  async token(@Body() dto: OpenApiTokenDto, @Req() req: Request) {
    const start = Date.now();
    try {
      const result = await this.authService.issueToken(dto.clientId, dto.clientSecret);
      await this.logCall(req, null, 'POST', '/openapi/v1/auth/token', 200, 'success', Date.now() - start);
      return result;
    } catch (err: any) {
      await this.logCall(req, null, 'POST', '/openapi/v1/auth/token', err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /** POST /openapi/v1/sessions — 创建会话 */
  @Post('sessions')
  @UseGuards(OpenApiAuthGuard)
  async createSession(
    @CurrentApp() app: OpenApiAppContext,
    @Body() dto: OpenApiCreateSessionDto,
    @Req() req: Request,
  ) {
    const start = Date.now();
    try {
      const tenantId = await this.authService.resolveTenantId(
        app.allowedTenantIds,
        dto.tenantId,
        dto.externalTenantId,
      );

      const session = await this.prisma.session.create({
        data: {
          tenantId,
          userId: app.appId,
          title: dto.title ?? null,
        },
      });

      await this.logCall(req, app.appId, 'POST', '/openapi/v1/sessions', 201, 'success', Date.now() - start, undefined, tenantId);
      return {
        id: session.id,
        tenantId: session.tenantId,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt,
      };
    } catch (err: any) {
      await this.logCall(req, app.appId, 'POST', '/openapi/v1/sessions', err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /** GET /openapi/v1/sessions/:id — 获取会话历史 */
  @Get('sessions/:id')
  @UseGuards(OpenApiAuthGuard)
  async getSession(
    @CurrentApp() app: OpenApiAppContext,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const start = Date.now();
    try {
      const session = await this.prisma.session.findUnique({
        where: { id },
        include: { messages: { orderBy: { seq: 'asc' } } },
      });
      if (!session) {
        throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: `会话不存在：${id}` });
      }
      await this.authService.assertTenantAccess(app.allowedTenantIds, session.tenantId);

      await this.logCall(req, app.appId, 'GET', `/openapi/v1/sessions/${id}`, 200, 'success', Date.now() - start, undefined, session.tenantId);
      return {
        id: session.id,
        tenantId: session.tenantId,
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
    } catch (err: any) {
      await this.logCall(req, app.appId, 'GET', `/openapi/v1/sessions/${id}`, err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /** POST /openapi/v1/sessions/:id/messages — 发送消息并触发 Agent Runtime 编排 */
  @Post('sessions/:id/messages')
  @UseGuards(OpenApiAuthGuard)
  async sendMessage(
    @CurrentApp() app: OpenApiAppContext,
    @Param('id') sessionId: string,
    @Body() dto: OpenApiSendMessageDto,
    @Req() req: Request,
  ) {
    const start = Date.now();
    try {
      const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        throw new ForbiddenException({ code: 'SESSION_NOT_FOUND', message: `会话不存在：${sessionId}` });
      }
      await this.authService.assertTenantAccess(app.allowedTenantIds, session.tenantId);

      const result = await this.runtimeService.sendMessage(
        this.toRuntimeUser(app),
        sessionId,
        {
          content: dto.content,
          mode: dto.mode ?? 'stream',
        },
      );

      await this.logCall(req, app.appId, 'POST', `/openapi/v1/sessions/${sessionId}/messages`, 201, 'success', Date.now() - start, undefined, session.tenantId);
      return result;
    } catch (err: any) {
      await this.logCall(req, app.appId, 'POST', `/openapi/v1/sessions/${sessionId}/messages`, err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /**
   * GET /openapi/v1/sessions/:id/stream — SSE 流式结果订阅
   *
   * 连接后先推送历史消息快照（session.connected / message / session.snapshot_end），
   * 再订阅 SseEmitterService 推送与 Agent Runtime 一致的实时事件。
   * 连接保持至客户端断开；stream 模式下请先建立 SSE 再 POST 发消息。
   */
  @Get('sessions/:id/stream')
  @UseGuards(OpenApiAuthGuard)
  async streamSession(
    @CurrentApp() app: OpenApiAppContext,
    @Param('id') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const start = Date.now();
    try {
      const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        res.status(404).json({ code: 'SESSION_NOT_FOUND', message: `会话不存在：${sessionId}` });
        return;
      }
      await this.authService.assertTenantAccess(app.allowedTenantIds, session.tenantId);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

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

      await this.logCall(req, app.appId, 'GET', `/openapi/v1/sessions/${sessionId}/stream`, 200, 'success', Date.now() - start, undefined, session.tenantId);

      const keepAlive = setInterval(() => {
        res.write(`:keepalive\n\n`);
      }, 15000);

      req.on('close', () => {
        this.logger.debug(`OpenAPI SSE 客户端断开 session=${sessionId}`);
        clearInterval(keepAlive);
        unsubscribe();
        res.end();
      });
    } catch (err: any) {
      await this.logCall(req, app.appId, 'GET', `/openapi/v1/sessions/${sessionId}/stream`, err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /** GET /openapi/v1/tasks/:id — 查询任务状态 */
  @Get('tasks/:id')
  @UseGuards(OpenApiAuthGuard)
  async getTask(
    @CurrentApp() app: OpenApiAppContext,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const start = Date.now();
    try {
      const task = await this.prisma.task.findUnique({
        where: { id },
        include: {
          steps: { orderBy: { seq: 'asc' } },
        },
      });
      if (!task) {
        throw new ForbiddenException({ code: 'TASK_NOT_FOUND', message: `任务不存在：${id}` });
      }
      await this.authService.assertTenantAccess(app.allowedTenantIds, task.tenantId);

      await this.logCall(req, app.appId, 'GET', `/openapi/v1/tasks/${id}`, 200, 'success', Date.now() - start, undefined, task.tenantId);
      return {
        id: task.id,
        tenantId: task.tenantId,
        sessionId: task.sessionId,
        title: task.title,
        type: task.type,
        status: task.status,
        capabilityType: task.capabilityType,
        currentNode: task.currentNode,
        input: task.input,
        output: task.output,
        retryCount: task.retryCount,
        failReason: task.failReason,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        steps: task.steps.map((s) => ({
          id: s.id,
          seq: s.seq,
          name: s.name,
          status: s.status,
          toolName: s.toolName,
          durationMs: s.durationMs,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        })),
      };
    } catch (err: any) {
      await this.logCall(req, app.appId, 'GET', `/openapi/v1/tasks/${id}`, err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /** POST /openapi/v1/confirmations/:id — 提交人工确认结果 */
  @Post('confirmations/:id')
  @UseGuards(OpenApiAuthGuard)
  async submitConfirmation(
    @CurrentApp() app: OpenApiAppContext,
    @Param('id') id: string,
    @Body() dto: OpenApiConfirmationDto,
    @Req() req: Request,
  ) {
    const start = Date.now();
    try {
      const result = await this.approvalRuntime.reviewByOpenApi(
        app.allowedTenantIds,
        id,
        dto.action,
        dto.opinion,
        { appId: app.appId, appName: app.appName },
      );

      await this.logCall(req, app.appId, 'POST', `/openapi/v1/confirmations/${id}`, 200, 'success', Date.now() - start, undefined, result.approval.tenantId);
      return {
        id: result.approval.id,
        status: result.approval.status,
        opinion: result.approval.opinion,
        reviewedAt: result.approval.reviewedAt,
        resumed: result.resumed,
      };
    } catch (err: any) {
      await this.logCall(req, app.appId, 'POST', `/openapi/v1/confirmations/${id}`, err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /** 接口文档描述 — 返回 OpenAPI 接口清单供管理后台或第三方查看 */
  @Get('docs')
  apiDocs() {
    return {
      title: 'shellder-agent OpenAPI',
      version: 'v1',
      baseUrl: '/openapi/v1',
      endpoints: [
        { method: 'POST', path: '/auth/token', description: '应用鉴权，换取 Token', auth: 'Client ID + Client Secret' },
        { method: 'POST', path: '/sessions', description: '创建会话', auth: 'Bearer Token' },
        { method: 'GET', path: '/sessions/:id', description: '获取会话历史', auth: 'Bearer Token' },
        { method: 'POST', path: '/sessions/:id/messages', description: '发送消息并触发 Agent Runtime 编排（mode=sync|stream，默认 stream）', auth: 'Bearer Token' },
        { method: 'GET', path: '/sessions/:id/stream', description: 'SSE 流式结果订阅（先历史快照，再实时 Runtime 事件）', auth: 'Bearer Token' },
        { method: 'GET', path: '/tasks/:id', description: '查询任务状态', auth: 'Bearer Token' },
        { method: 'POST', path: '/confirmations/:id', description: '提交人工确认结果', auth: 'Bearer Token' },
      ],
      authentication: {
        type: 'Client Credentials → Bearer Token',
        tokenEndpoint: '/openapi/v1/auth/token',
        tokenMethod: 'POST { clientId, clientSecret } → { accessToken, tokenType, expiresIn }',
      },
      errors: [
        { code: 'OPENAPI_UNAUTHENTICATED', status: 401, description: '缺少或无效的访问令牌' },
        { code: 'OPENAPI_INVALID_CREDENTIALS', status: 401, description: 'Client ID 或 Secret 不正确' },
        { code: 'OPENAPI_APP_DISABLED', status: 403, description: '接入应用已被禁用' },
        { code: 'OPENAPI_TENANT_FORBIDDEN', status: 403, description: '应用无权访问此租户' },
        { code: 'TENANT_DISABLED', status: 403, description: '租户已禁用' },
        { code: 'TENANT_NOT_FOUND', status: 404, description: '租户不存在' },
        { code: 'SESSION_NOT_FOUND', status: 404, description: '会话不存在' },
        { code: 'SESSION_CLOSED', status: 400, description: '会话已结束，无法发送消息' },
        { code: 'SESSION_PENDING_CONFIRM', status: 400, description: '会话等待人工确认中' },
        { code: 'RUNTIME_ERROR', status: 500, description: 'Agent Runtime 编排异常（SSE error 事件同步推送）' },
        { code: 'POLICY_DENIED', status: 403, description: '策略拒绝工具调用' },
        { code: 'TASK_NOT_FOUND', status: 404, description: '任务不存在' },
        { code: 'APPROVAL_NOT_FOUND', status: 404, description: '审批记录不存在' },
      ],
      sse: {
        description:
          'GET /sessions/:id/stream 返回 SSE 流。连接后先推送历史快照，再订阅 Agent Runtime 实时事件。stream 模式下请先建立 SSE 连接，再 POST 发消息。',
        snapshotEventTypes: [
          'session.connected — 连接成功，附带 sessionId 与会话状态',
          'message — 历史消息快照（含 role/type/content/seq）',
          'session.snapshot_end — 历史快照传输完成',
        ],
        runtimeEventTypes: [
          'delta — 流式文本片段 { text, seq? }',
          'tool_start — 工具开始 { toolName, toolId?, input? }',
          'tool_end — 工具结束 { toolName, status, output?, error? }',
          'confirm_required — 需人工确认 { toolName, reason, messageId, approvalId? }',
          'done — 编排完成 { messageId, capabilityType?, summary? }',
          'error — 编排错误 { code, message }',
        ],
        usage: [
          '1. POST /auth/token 换取 accessToken',
          '2. POST /sessions 创建会话',
          '3. GET /sessions/:id/stream 建立 SSE（Bearer Token）',
          '4. POST /sessions/:id/messages { content, mode: "stream" } 发消息',
          '5. SSE 收到 delta → done（或 error）',
        ],
      },
    };
  }

  private toRuntimeUser(app: OpenApiAppContext): AuthUser {
    return {
      id: app.appId,
      username: app.appName,
      roles: ['openapi'],
      tenantIds: app.allowedTenantIds,
    };
  }

  private writeSseEvent(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
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
