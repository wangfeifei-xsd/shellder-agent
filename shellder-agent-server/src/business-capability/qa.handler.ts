import { HttpException, Injectable, Logger } from '@nestjs/common';
import { KnowledgeProxyService } from '../knowledge/knowledge-proxy.service';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from '../agent-runtime/agent-runtime.types';
import { CapabilityResult, Citation } from './capability-result';

/**
 * 问答型能力 Handler（§5.1）。
 *
 * 经 KnowledgeProxyService 调用 pathy `POST /api/v1/dialogue/recall`；
 * 不在平台内做 kb_chunk / 向量检索。
 */
@Injectable()
export class QaCapabilityHandler implements CapabilityHandler {
  readonly type = 'qa';
  private readonly logger = new Logger(QaCapabilityHandler.name);

  constructor(private readonly knowledgeProxy: KnowledgeProxyService) {}

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    emitSse({
      event: 'tool_start',
      data: { toolName: 'knowledge_recall', input: { query: ctx.userMessage } },
    });

    const startTime = Date.now();

    try {
      const recall = await this.knowledgeProxy.dialogueRecall(ctx.tenantId, {
        query: ctx.userMessage,
        top_k_chunks: 6,
      });

      const citations: Citation[] = (recall.recall_hits ?? []).map((hit) => ({
        documentTitle: hit.path,
        content: hit.snippet,
        score: hit.score,
      }));

      let replyText: string;
      if (citations.length === 0) {
        replyText =
          recall.message ??
          '未在知识库中找到与您问题相关的内容。请尝试换个角度描述问题，或联系管理员补充相关知识。';
      } else {
        replyText = this.composeAnswer(ctx.userMessage, citations, recall.injected_context);
      }

      const chunks = this.splitText(replyText, 40);
      for (const chunk of chunks) {
        emitSse({ event: 'delta', data: { text: chunk } });
        await this.delay(30);
      }

      const durationMs = Date.now() - startTime;
      emitSse({
        event: 'tool_end',
        data: {
          toolName: 'knowledge_recall',
          status: 'success',
          durationMs,
          output: {
            citationCount: citations.length,
            recallMethod: recall.recall_method,
            filesScanned: (recall as { files_scanned?: number }).files_scanned,
          },
        },
      });

      const result: CapabilityResult = {
        capabilityType: 'qa',
        data: { text: replyText },
        citations,
        status: 'success',
      };

      return { success: true, output: result, textChunks: chunks };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = this.formatProxyError(err);
      this.logger.error(`QA 能力执行失败：${errorMsg}`);

      emitSse({
        event: 'tool_end',
        data: {
          toolName: 'knowledge_recall',
          status: 'failed',
          durationMs,
          error: errorMsg,
        },
      });

      const result: CapabilityResult = {
        capabilityType: 'qa',
        data: { text: errorMsg },
        citations: [],
        status: 'failed',
        error: errorMsg,
      };

      return { success: false, output: result, error: errorMsg };
    }
  }

  private formatProxyError(err: unknown): string {
    if (err instanceof HttpException) {
      const raw = err.getResponse();
      const res =
        typeof raw === 'object' && raw !== null
          ? (raw as { message?: string | string[]; code?: string })
          : { message: String(raw) };
      const msg = Array.isArray(res.message) ? res.message.join('; ') : res.message;
      if (res.code === 'KNOWLEDGE_PROXY_UNAVAILABLE') {
        return `知识库服务不可用：${msg ?? '请检查 PATHY_KNOWLEDGE_SERVER_BASE_URL 与 pathy 进程'}`;
      }
      if (res.code === 'KNOWLEDGE_PROXY_TIMEOUT') {
        return `知识库服务请求超时：${msg ?? ''}`;
      }
      return `知识库召回失败：${msg ?? err.message}`;
    }
    return err instanceof Error ? err.message : String(err);
  }

  private composeAnswer(
    question: string,
    citations: Citation[],
    injectedContext?: string,
  ): string {
    if (injectedContext?.trim()) {
      const sources = citations
        .slice(0, 3)
        .map((c, i) => `[${i + 1}] ${c.documentTitle ?? '未命名'}`)
        .join('；');
      return `基于知识库检索结果（${question}）：\n\n${injectedContext.trim()}\n\n--- 引用来源：${sources}`;
    }

    const relevantContent = citations
      .slice(0, 3)
      .map((c, i) => `[${i + 1}] ${c.content}`)
      .join('\n\n');

    const sources = citations
      .slice(0, 3)
      .map((c, i) => `[${i + 1}] ${c.documentTitle ?? '未命名文档'}`)
      .join('；');

    return `基于知识库检索结果：\n\n${relevantContent}\n\n--- 引用来源：${sources}`;
  }

  private splitText(text: string, chunkSize: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      result.push(text.slice(i, i + chunkSize));
    }
    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
