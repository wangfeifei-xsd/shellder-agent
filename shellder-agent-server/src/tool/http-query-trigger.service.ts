import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@prisma/client';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { ToolService } from './tool.service';
import { ToolInvocationService } from './tool-invocation.service';
import { InvokeContext, ToolInvokeResult } from './tool-invocation.types';
import {
  httpQueryParamsSatisfied,
  mergeHttpQueryParams,
} from './http-query-param.util';
import {
  ParsedHttpQuerySignal,
  parseHttpQuerySignal,
  peekHttpQuerySignal,
} from './http-query-signal.util';
import { HttpQueryParameter, HttpQueryToolConfig } from './tool.types';

export type HttpQueryParamSource = 'signal' | 'llm' | 'none';

export interface HttpQueryTriggerResult {
  triggered: boolean;
  signal?: ParsedHttpQuerySignal;
  tool?: Tool;
  invokeResult?: ToolInvokeResult;
  replyText?: string;
  message?: string;
  resolvedParams?: Record<string, unknown>;
}

/**
 * HTTP 业务查询工具 Runtime 触发（信号 parse + invoke）。
 * 能力层归属 action，由 ActionCapabilityHandler 委托。
 */
@Injectable()
export class HttpQueryTriggerService {
  private readonly logger = new Logger(HttpQueryTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolService: ToolService,
    private readonly invocation: ToolInvocationService,
    private readonly llm: LlmService,
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
   * 解析 http_query 调用入参：优先信号 JSON，不足时用 LLM 从自然语言抽取。
   * 路由绑定 toolIds 执行时，用户话术通常不含 [查询工具:...] 信号，需走 LLM 补参。
   */
  async resolveInvokeParams(
    tool: Tool,
    userMessage: string,
  ): Promise<{ params: Record<string, unknown>; source: HttpQueryParamSource }> {
    const cfg = this.toolService.readConfig(tool).httpQuery;
    const parameters = cfg?.parameters ?? [];
    const signal = this.parseSignal(userMessage);

    let params: Record<string, unknown> = {};
    let source: HttpQueryParamSource = 'none';

    if (
      signal &&
      (!cfg?.toolCode || signal.toolCode === cfg.toolCode)
    ) {
      params = { ...signal.params };
      source = 'signal';
    }

    if (!httpQueryParamsSatisfied(params, parameters, tool.inputSchema)) {
      const extracted = await this.extractParamsWithLlm(
        tool.name,
        tool.description,
        userMessage,
        parameters,
      );
      if (extracted) {
        params = mergeHttpQueryParams(extracted, params);
        if (source !== 'signal') {
          source = 'llm';
        }
      }
    }

    return { params, source };
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

    const { params } = await this.resolveInvokeParams(tool, text);
    const invokeResult = await this.invokeTool(tool, params, {
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
      resolvedParams: params,
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

  private async extractParamsWithLlm(
    toolName: string,
    toolDescription: string | null,
    userMessage: string,
    parameters: HttpQueryParameter[],
  ): Promise<Record<string, unknown> | null> {
    if (parameters.length === 0) {
      return null;
    }

    try {
      await this.llm.assertConfigured();
    } catch {
      this.logger.warn('LLM 未配置，无法从自然语言抽取 http_query 入参');
      return null;
    }

    const paramLines = parameters
      .map(
        (p) =>
          `- ${p.name} (${p.type || 'string'}${p.required ? ', 必填' : ''})${p.description ? `：${p.description}` : ''}`,
      )
      .join('\n');

    const systemPrompt = `你是 HTTP 查询工具入参抽取助手。
根据用户自然语言，为指定工具抽取调用参数。
要求：
1. 仅输出一个 JSON 对象，不要 markdown，不要额外说明
2. 键名必须与参数定义中的 name 完全一致
3. 只填写用户话术中能明确推断的值，不要编造
4. 无法推断的必填项可省略该键
5. 字符串值保持用户原文中的实体名（如公司名、人名）`;

    const userPrompt = [
      `工具：${toolName}`,
      toolDescription ? `说明：${toolDescription}` : '',
      `参数定义：\n${paramLines}`,
      `用户问题：${userMessage}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const completion = await this.llm.chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      const parsed = this.parseParamsJson(completion.text);
      if (!parsed) return null;
      return parsed;
    } catch (err) {
      this.logger.warn(
        `http_query 入参 LLM 抽取失败：${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private parseParamsJson(text: string): Record<string, unknown> | null {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fence?.[1] ?? trimmed).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
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
