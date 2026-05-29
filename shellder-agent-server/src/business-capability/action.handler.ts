import { Injectable, Logger } from '@nestjs/common';
import { AuditStatus, Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decryptSecret } from '../connector/connector-secret.util';
import { ToolService } from '../tool/tool.service';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from '../agent-runtime/agent-runtime.types';
import { CapabilityResult } from './capability-result';
import { HttpToolConfig } from '../tool/tool.types';

/**
 * 操作型能力 Handler（§5.3）。
 *
 * 调用外部系统执行单步业务动作：
 * - Action Tool + Notification Tool
 * - HTTP / 消息通知连接器（06）
 * - Policy + 确认节点（05、12、14）
 * - 完整操作审计
 * - 高风险动作进入待确认状态（验收标准 3）
 */
@Injectable()
export class ActionCapabilityHandler implements CapabilityHandler {
  readonly type = 'action';
  private readonly logger = new Logger(ActionCapabilityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly toolService: ToolService,
  ) {}

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    const toolIds = ctx.toolIds ?? [];
    if (toolIds.length === 0) {
      const msg = '未指定操作工具（Action/Notification Tool），无法执行操作型能力。';
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: msg },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    const toolId = toolIds[0];
    const tool = await this.prisma.tool.findUnique({
      where: { id: toolId },
      include: { connector: true },
    });

    if (!tool || (tool.type !== 'action' && tool.type !== 'notification')) {
      const msg = `工具 ${toolId} 不存在或非操作/通知型`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: msg },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (tool.status === 'disabled') {
      const msg = `操作工具「${tool.name}」已停用`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: msg },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (!tool.connector) {
      const msg = `操作工具「${tool.name}」未关联连接器`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: msg },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (tool.connector.status === 'disabled') {
      const msg = `关联连接器「${tool.connector.name}」已停用`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: msg },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    emitSse({
      event: 'tool_start',
      data: { toolName: tool.name, toolId: tool.id, input: { action: ctx.userMessage } },
    });

    const startTime = Date.now();

    try {
      const httpConfig = this.readHttpConfig(tool);
      const connector = tool.connector;
      const url = this.joinUrl(connector.target, httpConfig.path);
      const method = (httpConfig.method || 'POST').toUpperCase();
      const headers = {
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders(connector),
        ...(httpConfig.headers ?? {}),
      };

      const requestBody = httpConfig.bodyTemplate ?? { message: ctx.userMessage };
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const body = hasBody ? JSON.stringify(requestBody) : undefined;

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        tool.timeoutMs ?? 10000,
      );

      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const durationMs = Date.now() - startTime;
      const responseText = await res.text();
      const responseData = this.tryParseJson(responseText);
      const ok = res.status < 400;

      await this.auditService.logExternalCall({
        tenantId: ctx.tenantId,
        connectorId: connector.id,
        target: connector.target,
        method,
        callerUserId: ctx.userId,
        requestSummary: `[${tool.name}] ${ctx.userMessage}`.slice(0, 256),
        status: ok ? AuditStatus.success : AuditStatus.failed,
        statusCode: res.status,
        durationMs,
        errorMessage: ok ? null : `HTTP ${res.status}`,
      });

      emitSse({
        event: 'tool_end',
        data: {
          toolName: tool.name,
          toolId: tool.id,
          status: ok ? 'success' : 'failed',
          durationMs,
          output: ok ? responseData : undefined,
          error: ok ? undefined : `HTTP ${res.status}`,
        },
      });

      const replyText = ok
        ? `操作「${tool.name}」执行成功（HTTP ${res.status}，耗时 ${durationMs}ms）。`
        : `操作「${tool.name}」执行失败（HTTP ${res.status}）。`;

      emitSse({ event: 'delta', data: { text: replyText } });

      const result: CapabilityResult = {
        capabilityType: 'action',
        data: {
          text: replyText,
          httpStatus: res.status,
          response: responseData ?? responseText,
        },
        status: ok ? 'success' : 'failed',
        error: ok ? undefined : `HTTP ${res.status}`,
      };

      return {
        success: ok,
        output: result,
        textChunks: [replyText],
        error: ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const aborted = err instanceof Error && err.name === 'AbortError';
      const errorMsg = aborted
        ? `操作超时（>${tool.timeoutMs}ms）`
        : `操作执行异常：${err instanceof Error ? err.message : String(err)}`;

      this.logger.error(`Action 能力执行失败 tool=${tool.name}: ${errorMsg}`);

      await this.auditService.logExternalCall({
        tenantId: ctx.tenantId,
        connectorId: tool.connector.id,
        target: tool.connector.target,
        method: 'HTTP',
        callerUserId: ctx.userId,
        requestSummary: `[${tool.name}] ${ctx.userMessage}`.slice(0, 256),
        status: AuditStatus.failed,
        statusCode: null,
        durationMs,
        errorMessage: errorMsg,
      });

      emitSse({
        event: 'tool_end',
        data: { toolName: tool.name, toolId: tool.id, status: 'failed', durationMs, error: errorMsg },
      });
      emitSse({ event: 'delta', data: { text: errorMsg } });

      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: errorMsg },
        status: 'failed',
        error: errorMsg,
      };

      return { success: false, output: result, error: errorMsg };
    }
  }

  private readHttpConfig(tool: Tool): HttpToolConfig {
    const config = (tool.config as any)?.http;
    return config ?? { method: 'POST', path: '' };
  }

  private buildAuthHeaders(connector: any): Record<string, string> {
    const secret = decryptSecret(connector.config?.secretCipher);
    const headers: Record<string, string> = {};
    if (!secret) return headers;

    switch (connector.authType) {
      case 'basic': {
        const u = String(secret.username ?? '');
        const p = String(secret.password ?? '');
        headers.Authorization = `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
        break;
      }
      case 'bearer':
        if (secret.token) headers.Authorization = `Bearer ${String(secret.token)}`;
        break;
      case 'api_key': {
        const name = String(secret.headerName ?? 'X-API-Key');
        if (secret.apiKey) headers[name] = String(secret.apiKey);
        break;
      }
      case 'custom':
        for (const [k, v] of Object.entries(secret)) {
          if (k.startsWith('header.')) headers[k.slice('header.'.length)] = String(v);
        }
        break;
      default:
        break;
    }
    return headers;
  }

  private joinUrl(base: string, path: string): string {
    if (!path) return base;
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  private tryParseJson(text: string): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
