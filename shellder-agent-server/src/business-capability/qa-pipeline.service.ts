import { HttpException, Injectable } from '@nestjs/common';
import { KnowledgeProxyService, DialogueRecallResponse } from '../knowledge/knowledge-proxy.service';
import { LlmService, ChatMessage } from '../llm/llm.service';
import { Citation } from './capability-result';

export interface QaPipelineInput {
  tenantId: string;
  userMessage: string;
  topKChunks?: number;
  recallBody?: Record<string, unknown>;
  systemPromptOverride?: string;
}

export interface QaPipelineResult {
  replyText: string;
  citations: Citation[];
  recall: DialogueRecallResponse;
  model: string;
  elapsedMs: number;
}

/**
 * 问答型两阶段流水线（pathy recall → 平台 LLM），供 Runtime 与管理端预览共用。
 */
@Injectable()
export class QaPipelineService {
  constructor(
    private readonly knowledgeProxy: KnowledgeProxyService,
    private readonly llmService: LlmService,
  ) {}

  async run(input: QaPipelineInput): Promise<QaPipelineResult> {
    await this.llmService.assertConfigured();

    const recall = await this.knowledgeProxy.dialogueRecall(input.tenantId, {
      query: input.userMessage,
      top_k_chunks: input.topKChunks ?? 6,
      ...input.recallBody,
    });

    const citations = this.buildCitations(recall);
    const messages = this.buildChatMessages(
      input.userMessage,
      citations,
      recall.injected_context,
      input.systemPromptOverride,
    );

    const start = Date.now();
    const completion = await this.llmService.chatCompletion(messages);
    return {
      replyText: completion.text,
      citations,
      recall,
      model: completion.model,
      elapsedMs: Date.now() - start,
    };
  }

  async runStream(
    input: QaPipelineInput,
    onDelta: (delta: string) => void | Promise<void>,
  ): Promise<QaPipelineResult> {
    await this.llmService.assertConfigured();

    const recall = await this.knowledgeProxy.dialogueRecall(input.tenantId, {
      query: input.userMessage,
      top_k_chunks: input.topKChunks ?? 6,
      ...input.recallBody,
    });

    const citations = this.buildCitations(recall);
    const messages = this.buildChatMessages(
      input.userMessage,
      citations,
      recall.injected_context,
      input.systemPromptOverride,
    );

    const start = Date.now();
    const streamResult = await this.llmService.chatCompletionStream(messages, onDelta);
    return {
      replyText: streamResult.text,
      citations,
      recall,
      model: streamResult.model,
      elapsedMs: Date.now() - start,
    };
  }

  buildCitations(recall: DialogueRecallResponse): Citation[] {
    return (recall.recall_hits ?? []).map((hit) => ({
      documentTitle: hit.path,
      content: hit.snippet,
      score: hit.score,
    }));
  }

  buildChatMessages(
    userMessage: string,
    citations: Citation[],
    injectedContext?: string,
    systemPromptOverride?: string,
  ): ChatMessage[] {
    const systemContent =
      systemPromptOverride?.trim() ||
      this.composeSystemPrompt(citations, injectedContext);

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage },
    ];
  }

  composeSystemPrompt(citations: Citation[], injectedContext?: string): string {
    const citationLines =
      citations.length > 0
        ? citations
            .slice(0, 6)
            .map(
              (c, i) =>
                `[${i + 1}] ${c.documentTitle ?? '未命名'} (score=${c.score?.toFixed(4) ?? 'n/a'})\n${c.content ?? ''}`,
            )
            .join('\n\n')
        : '（无召回命中）';

    const contextBlock = injectedContext?.trim()
      ? `\n\n## 注入上下文\n${injectedContext.trim()}`
      : '';

    return `你是 shellder-agent 平台的问答助手。请基于下方「知识库召回结果」回答用户问题。
- 优先使用注入上下文与引用片段中的事实；不要编造未出现的信息。
- 若知识库无相关内容，礼貌说明未找到相关信息，并建议用户换种问法或联系管理员。
- 回答末尾可简要列出引用来源编号。

## 召回引用
${citationLines}${contextBlock}`;
  }

  formatProxyError(err: unknown): string {
    if (err instanceof HttpException) {
      const raw = err.getResponse();
      const res =
        typeof raw === 'object' && raw !== null
          ? (raw as { message?: string | string[]; code?: string })
          : { message: String(raw) };
      const msg = Array.isArray(res.message) ? res.message.join('; ') : res.message;
      if (res.code === 'LLM_NOT_CONFIGURED') {
        return msg ?? '平台 LLM 未配置';
      }
      if (res.code === 'KNOWLEDGE_PROXY_UNAVAILABLE') {
        return `知识库服务不可用：${msg ?? '请检查 PATHY_KNOWLEDGE_SERVER_BASE_URL 与 pathy 进程'}`;
      }
      if (res.code === 'KNOWLEDGE_PROXY_TIMEOUT') {
        return `知识库服务请求超时：${msg ?? ''}`;
      }
      if (res.code === 'LLM_UPSTREAM_ERROR' || res.code === 'LLM_TIMEOUT') {
        return `模型调用失败：${msg ?? ''}`;
      }
      return msg ?? err.message;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
