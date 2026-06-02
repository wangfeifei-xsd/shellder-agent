import { HttpException, Injectable } from '@nestjs/common';
import { KnowledgeProxyService, DialogueRecallResponse } from '../knowledge/knowledge-proxy.service';
import { LlmService, ChatMessage } from '../llm/llm.service';
import { PROMPT_KEYS } from '../prompt/prompt-keys';
import { PromptResolverService } from '../prompt/prompt-resolver.service';
import { Citation } from './capability-result';
import { buildQaDialogueSystemVariables } from './qa-pipeline.variables';

export interface QaPipelineInput {
  tenantId: string;
  userMessage: string;
  topKChunks?: number;
  recallBody?: Record<string, unknown>;
  /** 仅管理端预览：draft 须 prompt:debug，Runtime 固定 published */
  promptChannel?: 'published' | 'draft';
  promptKey?: string;
}

export interface QaPipelineResult {
  replyText: string;
  citations: Citation[];
  recall: DialogueRecallResponse;
  model: string;
  elapsedMs: number;
  promptVersion?: number;
}

/**
 * 问答型两阶段流水线（pathy recall → 平台 LLM），供 Runtime 与管理端预览共用。
 */
@Injectable()
export class QaPipelineService {
  constructor(
    private readonly knowledgeProxy: KnowledgeProxyService,
    private readonly llmService: LlmService,
    private readonly promptResolver: PromptResolverService,
  ) {}

  async run(input: QaPipelineInput): Promise<QaPipelineResult> {
    await this.llmService.assertConfigured();

    const recall = await this.knowledgeProxy.dialogueRecall(input.tenantId, {
      query: input.userMessage,
      top_k_chunks: input.topKChunks ?? 6,
      ...input.recallBody,
    });

    const citations = this.buildCitations(recall);
    const { messages, promptVersion } = await this.buildChatMessages(
      input.tenantId,
      input.userMessage,
      citations,
      recall.injected_context,
      input.promptChannel ?? 'published',
      input.promptKey ?? PROMPT_KEYS.QA_DIALOGUE_SYSTEM,
    );

    const start = Date.now();
    const completion = await this.llmService.chatCompletion(messages);
    return {
      replyText: completion.text,
      citations,
      recall,
      model: completion.model,
      elapsedMs: Date.now() - start,
      promptVersion,
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
    const { messages, promptVersion } = await this.buildChatMessages(
      input.tenantId,
      input.userMessage,
      citations,
      recall.injected_context,
      'published',
      PROMPT_KEYS.QA_DIALOGUE_SYSTEM,
    );

    const start = Date.now();
    const streamResult = await this.llmService.chatCompletionStream(messages, onDelta);
    return {
      replyText: streamResult.text,
      citations,
      recall,
      model: streamResult.model,
      elapsedMs: Date.now() - start,
      promptVersion,
    };
  }

  buildCitations(recall: DialogueRecallResponse): Citation[] {
    return (recall.recall_hits ?? []).map((hit) => ({
      documentTitle: hit.path,
      content: hit.snippet,
      score: hit.score,
    }));
  }

  async buildChatMessages(
    tenantId: string,
    userMessage: string,
    citations: Citation[],
    injectedContext?: string,
    channel: 'published' | 'draft' = 'published',
    promptKey: string = PROMPT_KEYS.QA_DIALOGUE_SYSTEM,
  ): Promise<{ messages: ChatMessage[]; promptVersion: number }> {
    const variables = buildQaDialogueSystemVariables(citations, injectedContext);
    const rendered = await this.promptResolver.render({
      promptKey,
      channel,
      tenantId,
      variables,
    });

    return {
      messages: [
        { role: 'system', content: rendered.content },
        { role: 'user', content: userMessage },
      ],
      promptVersion: rendered.version,
    };
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
