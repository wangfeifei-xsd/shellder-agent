import { Injectable, Logger } from '@nestjs/common';
import { Tool, ToolType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ToolInvocationService } from '../tool/tool-invocation.service';
import { HttpQueryTriggerService } from '../tool/http-query-trigger.service';
import { parseHttpQuerySignal } from '../tool/http-query-signal.util';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from '../agent-runtime/agent-runtime.types';
import { CapabilityResult } from './capability-result';

const ACTION_TOOL_TYPES: ToolType[] = ['action', 'notification', 'http_query'];

/**
 * 操作型能力 Handler（§5.3）。
 *
 * 承载 action 能力下：
 * - Action / Notification Tool（HTTP 写操作）
 * - HttpQuery Tool（HTTP 业务只读查询，委托 HttpQueryTriggerService / Invoker）
 */
@Injectable()
export class ActionCapabilityHandler implements CapabilityHandler {
  readonly type = 'action';
  private readonly logger = new Logger(ActionCapabilityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invocation: ToolInvocationService,
    private readonly httpQueryTrigger: HttpQueryTriggerService,
  ) {}

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    const toolIds = ctx.toolIds ?? [];

    // 模式 A：LLM 文本信号触发 http_query（无路由 toolIds 时尝试）
    if (toolIds.length === 0 && this.httpQueryTrigger.peek(ctx.userMessage)) {
      return this.executeFromSignal(ctx, emitSse);
    }

    if (toolIds.length === 0) {
      const msg = '未指定操作工具（Action/Notification/HttpQuery Tool），无法执行操作型能力。';
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

    if (!tool || !ACTION_TOOL_TYPES.includes(tool.type)) {
      const msg = `工具 ${toolId} 不存在或非操作/通知/HTTP查询型`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: msg },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (tool.type === 'http_query') {
      const signal = parseHttpQuerySignal(ctx.userMessage);
      const params = signal?.params ?? {};
      return this.runToolInvoke(tool, params, ctx, emitSse, 'http_query');
    }

    const validationError = this.validateToolReady(tool);
    if (validationError) {
      emitSse({ event: 'delta', data: { text: validationError } });
      const result: CapabilityResult = {
        capabilityType: 'action',
        data: { text: validationError },
        status: 'failed',
        error: validationError,
      };
      return { success: false, output: result, error: validationError };
    }

    return this.runToolInvoke(tool, { message: ctx.userMessage }, ctx, emitSse, 'action');
  }

  private async executeFromSignal(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    emitSse({
      event: 'tool_resolve',
      data: { toolKind: 'http_query', source: 'signal' },
    });

    const triggerResult = await this.httpQueryTrigger.maybeExecuteFromSignal(
      ctx.tenantId,
      ctx.userMessage,
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        callerName: ctx.username,
        source: 'runtime',
        skipPolicy: true,
        sessionId: ctx.sessionId,
        principal: ctx.principalContext,
      },
    );

    if (!triggerResult.triggered || !triggerResult.tool || !triggerResult.invokeResult) {
      const msg = triggerResult.message ?? 'HTTP 查询工具信号未能执行';
      emitSse({ event: 'delta', data: { text: msg } });
      return {
        success: false,
        output: {
          capabilityType: 'action',
          data: { text: msg },
          status: 'failed',
          error: msg,
        },
        error: msg,
      };
    }

    const tool = triggerResult.tool;
    const invokeResult = triggerResult.invokeResult;
    const ok = invokeResult.status === 'success';
    const replyText = triggerResult.replyText ?? invokeResult.message;

    emitSse({
      event: 'tool_start',
      data: {
        toolName: tool.name,
        toolId: tool.id,
        toolKind: 'http_query',
        input: triggerResult.signal?.params,
      },
    });
    emitSse({
      event: 'tool_end',
      data: {
        toolName: tool.name,
        toolId: tool.id,
        toolKind: 'http_query',
        status: ok ? 'success' : 'failed',
        durationMs: invokeResult.durationMs,
        output: ok ? invokeResult.transformedResult : undefined,
        error: ok ? undefined : invokeResult.message,
      },
    });
    emitSse({ event: 'delta', data: { text: replyText } });

    return {
      success: ok,
      output: {
        capabilityType: 'action',
        data: { text: replyText, response: invokeResult.transformedResult },
        status: ok ? 'success' : 'failed',
        error: ok ? undefined : invokeResult.message,
      },
      textChunks: [replyText],
      error: ok ? undefined : invokeResult.message,
    };
  }

  private async runToolInvoke(
    tool: Tool & { connector: { status: string; name: string } | null },
    params: Record<string, unknown>,
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
    toolKind: 'action' | 'http_query',
  ): Promise<CapabilityHandlerResult> {
    const validationError = this.validateToolReady(tool);
    if (validationError) {
      emitSse({ event: 'delta', data: { text: validationError } });
      return {
        success: false,
        output: {
          capabilityType: 'action',
          data: { text: validationError },
          status: 'failed',
          error: validationError,
        },
        error: validationError,
      };
    }

    emitSse({
      event: 'tool_start',
      data: { toolName: tool.name, toolId: tool.id, toolKind, input: params },
    });

    try {
      const invokeResult = await this.invocation.invoke(tool, params, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        callerName: ctx.username,
        source: 'runtime',
        skipPolicy: true,
        sessionId: ctx.sessionId,
        requestSummary: ctx.userMessage.slice(0, 256),
        principal: ctx.principalContext,
      });

      const ok = invokeResult.status === 'success';
      const httpStatus =
        invokeResult.rawResponse &&
        typeof invokeResult.rawResponse === 'object' &&
        'status' in (invokeResult.rawResponse as object)
          ? (invokeResult.rawResponse as { status: number }).status
          : undefined;

      emitSse({
        event: 'tool_end',
        data: {
          toolName: tool.name,
          toolId: tool.id,
          toolKind,
          status: ok ? 'success' : 'failed',
          durationMs: invokeResult.durationMs,
          output: ok ? invokeResult.transformedResult : undefined,
          error: ok ? undefined : invokeResult.message,
        },
      });

      const replyText =
        toolKind === 'http_query' && ok
          ? invokeResult.message
          : ok
            ? `操作「${tool.name}」执行成功${httpStatus ? `（HTTP ${httpStatus}，耗时 ${invokeResult.durationMs}ms）` : ''}。`
            : `${toolKind === 'http_query' ? '查询' : '操作'}「${tool.name}」执行失败：${invokeResult.message}`;

      emitSse({ event: 'delta', data: { text: replyText } });

      return {
        success: ok,
        output: {
          capabilityType: 'action',
          data: {
            text: replyText,
            httpStatus,
            response: invokeResult.transformedResult,
          },
          status: ok ? 'success' : 'failed',
          error: ok ? undefined : invokeResult.message,
        },
        textChunks: [replyText],
        error: ok ? undefined : invokeResult.message,
      };
    } catch (err) {
      const errorMsg = `执行异常：${err instanceof Error ? err.message : String(err)}`;
      this.logger.error(`Action 能力执行失败 tool=${tool.name}: ${errorMsg}`);

      emitSse({
        event: 'tool_end',
        data: { toolName: tool.name, toolId: tool.id, toolKind, status: 'failed', durationMs: 0, error: errorMsg },
      });
      emitSse({ event: 'delta', data: { text: errorMsg } });

      return {
        success: false,
        output: {
          capabilityType: 'action',
          data: { text: errorMsg },
          status: 'failed',
          error: errorMsg,
        },
        error: errorMsg,
      };
    }
  }

  private validateToolReady(
    tool: Tool & { connector: { status: string; name: string } | null },
  ): string | null {
    if (tool.status === 'disabled') {
      return `工具「${tool.name}」已停用`;
    }
    if (!tool.connector) {
      return `工具「${tool.name}」未关联连接器`;
    }
    if (tool.connector.status === 'disabled') {
      return `关联连接器「${tool.connector.name}」已停用`;
    }
    return null;
  }
}
