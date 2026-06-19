import { Injectable } from '@nestjs/common';
import { Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ToolService } from './tool.service';
import { ToolInvocationService } from './tool-invocation.service';
import { InvokeContext, ToolInvokeResult } from './tool-invocation.types';
import {
  ParsedHttpQuerySignal,
  parseHttpQuerySignal,
  peekHttpQuerySignal,
} from './http-query-signal.util';
import { HttpQueryToolConfig } from './tool.types';

export interface HttpQueryTriggerResult {
  triggered: boolean;
  signal?: ParsedHttpQuerySignal;
  tool?: Tool;
  invokeResult?: ToolInvokeResult;
  replyText?: string;
  message?: string;
}

/**
 * HTTP 业务查询工具 Runtime 触发（信号 parse + invoke）。
 * 能力层归属 action，由 ActionCapabilityHandler 委托。
 */
@Injectable()
export class HttpQueryTriggerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolService: ToolService,
    private readonly invocation: ToolInvocationService,
  ) {}

  peek(text: string): boolean {
    return peekHttpQuerySignal(text);
  }

  parseSignal(text: string): ParsedHttpQuerySignal | null {
    return parseHttpQuerySignal(text);
  }

  async findByToolCode(tenantId: string, toolCode: string): Promise<Tool | null> {
    const tools = await this.prisma.tool.findMany({
      where: { tenantId, type: 'http_query', status: 'enabled' },
    });
    for (const tool of tools) {
      const cfg = this.toolService.readConfig(tool).httpQuery;
      if (cfg?.toolCode === toolCode) return tool;
    }
    return null;
  }

  async invokeTool(
    tool: Tool,
    params: Record<string, unknown>,
    ctx: InvokeContext,
  ): Promise<ToolInvokeResult> {
    return this.invocation.invoke(tool, params, ctx);
  }

  /**
   * 解析信号并执行（maybeExecute）。
   * 未命中信号或未找到 Tool 时 triggered=false。
   */
  async maybeExecuteFromSignal(
    tenantId: string,
    text: string,
    ctx: Omit<InvokeContext, 'requestSummary'> & { requestSummary?: string },
  ): Promise<HttpQueryTriggerResult> {
    const signal = this.parseSignal(text);
    if (!signal) {
      return { triggered: false, message: '未检测到 HTTP 查询工具信号' };
    }

    const tool = await this.findByToolCode(tenantId, signal.toolCode);
    if (!tool) {
      return {
        triggered: false,
        signal,
        message: `未找到 toolCode=${signal.toolCode} 的 HTTP 查询工具`,
      };
    }

    const invokeResult = await this.invokeTool(tool, signal.params, {
      ...ctx,
      requestSummary: ctx.requestSummary ?? signal.raw,
    });

    const replyText = this.buildReplyText(tool, invokeResult);
    return {
      triggered: true,
      signal,
      tool,
      invokeResult,
      replyText,
      message: invokeResult.message,
    };
  }

  /** 构建 Prompt 注入用的工具目录段落（变量 {{toolCatalog}}） */
  buildToolCatalog(tools: Array<{ config: unknown; name: string; description: string | null }>): string {
    const lines: string[] = [];
    for (const tool of tools) {
      const cfg = (tool.config as { httpQuery?: HttpQueryToolConfig })?.httpQuery;
      if (!cfg?.toolCode) continue;
      const params = (cfg.parameters ?? [])
        .map((p) => `${p.name}${p.required ? '*' : ''}:${p.type}`)
        .join(', ');
      lines.push(
        `- ${cfg.toolCode}（${tool.name}）${tool.description ? `：${tool.description}` : ''}${params ? ` | 参数: ${params}` : ''}`,
      );
    }
    if (lines.length === 0) return '（当前租户暂无已启用的 HTTP 查询工具）';
    return lines.join('\n');
  }

  async listEnabledForTenant(tenantId: string): Promise<Tool[]> {
    return this.prisma.tool.findMany({
      where: { tenantId, type: 'http_query', status: 'enabled' },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  private buildReplyText(tool: Tool, result: ToolInvokeResult): string {
    if (result.status === 'success') {
      const cfg = this.toolService.readConfig(tool).httpQuery;
      if (cfg?.response?.type === 'text_reply' && cfg.response.replyTextPath) {
        const text = String(result.transformedResult ?? result.message);
        return text || result.message;
      }
      if (typeof result.transformedResult === 'string') {
        return result.transformedResult;
      }
      return `查询「${tool.name}」完成：${result.message}`;
    }
    return `查询「${tool.name}」失败：${result.message}`;
  }
}
