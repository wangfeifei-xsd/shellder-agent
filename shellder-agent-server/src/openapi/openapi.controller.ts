import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
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
  constructor(
    private readonly authService: OpenApiAuthService,
    private readonly prisma: PrismaService,
    private readonly callLogService: OpenApiCallLogService,
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

  /** POST /openapi/v1/sessions/:id/messages — 发送消息 */
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
          content: { text: dto.content },
          seq: (lastMsg?.seq ?? 0) + 1,
        },
      });

      await this.prisma.session.update({
        where: { id: sessionId },
        data: { lastMessageAt: new Date() },
      });

      await this.logCall(req, app.appId, 'POST', `/openapi/v1/sessions/${sessionId}/messages`, 201, 'success', Date.now() - start, undefined, session.tenantId);
      return {
        id: message.id,
        sessionId: message.sessionId,
        type: message.type,
        role: message.role,
        content: message.content,
        seq: message.seq,
        createdAt: message.createdAt,
      };
    } catch (err: any) {
      await this.logCall(req, app.appId, 'POST', `/openapi/v1/sessions/${sessionId}/messages`, err.status ?? 500, 'failed', Date.now() - start, err.message);
      throw err;
    }
  }

  /** GET /openapi/v1/sessions/:id/stream — SSE 流式结果订阅 */
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

      await this.logCall(req, app.appId, 'GET', `/openapi/v1/sessions/${sessionId}/stream`, 200, 'success', Date.now() - start, undefined, session.tenantId);

      const keepAlive = setInterval(() => {
        res.write(`:keepalive\n\n`);
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAlive);
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
      const approval = await this.prisma.approval.findUnique({ where: { id } });
      if (!approval) {
        throw new ForbiddenException({ code: 'APPROVAL_NOT_FOUND', message: `审批记录不存在：${id}` });
      }
      await this.authService.assertTenantAccess(app.allowedTenantIds, approval.tenantId);

      if (approval.status !== 'pending') {
        throw new ForbiddenException({
          code: 'APPROVAL_ALREADY_PROCESSED',
          message: `该审批已处理，当前状态：${approval.status}`,
        });
      }

      const updated = await this.prisma.approval.update({
        where: { id },
        data: {
          status: dto.action === 'approve' ? 'approved' : 'rejected',
          opinion: dto.opinion ?? null,
          reviewerId: app.appId,
          reviewerName: app.appName,
          reviewedAt: new Date(),
        },
      });

      await this.logCall(req, app.appId, 'POST', `/openapi/v1/confirmations/${id}`, 200, 'success', Date.now() - start, undefined, approval.tenantId);
      return {
        id: updated.id,
        status: updated.status,
        opinion: updated.opinion,
        reviewedAt: updated.reviewedAt,
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
        { method: 'POST', path: '/sessions/:id/messages', description: '发送消息', auth: 'Bearer Token' },
        { method: 'GET', path: '/sessions/:id/stream', description: 'SSE 流式结果订阅', auth: 'Bearer Token' },
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
        { code: 'TASK_NOT_FOUND', status: 404, description: '任务不存在' },
        { code: 'APPROVAL_NOT_FOUND', status: 404, description: '审批记录不存在' },
      ],
      sse: {
        description: 'GET /sessions/:id/stream 返回 SSE 流，事件格式与 Agent Runtime（阶段 12）一致',
        eventTypes: [
          'session.connected — 连接成功，附带会话状态',
          'message — 消息事件（含 role/type/content/seq）',
          'session.snapshot_end — 历史消息快照传输完成',
        ],
      },
    };
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
