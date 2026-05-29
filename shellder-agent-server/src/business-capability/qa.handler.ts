import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
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
 * 基于知识库内容回答用户问题：
 * - 多轮问答（上下文由 RuntimeContext 提供）
 * - 返回引用依据（citations）
 * - 按租户、场景限定知识范围
 * - 不直接查询实时业务数据
 */
@Injectable()
export class QaCapabilityHandler implements CapabilityHandler {
  readonly type = 'qa';
  private readonly logger = new Logger(QaCapabilityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

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
      const knowledgeBases = await this.prisma.knowledgeBase.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: 'active',
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (knowledgeBases.length === 0) {
        const fallbackText = '当前租户暂无可用知识库，无法执行问答检索。请联系管理员配置知识库。';
        emitSse({ event: 'delta', data: { text: fallbackText } });
        emitSse({
          event: 'tool_end',
          data: {
            toolName: 'knowledge_recall',
            status: 'success',
            durationMs: Date.now() - startTime,
            output: { message: 'no_knowledge_base' },
          },
        });

        const result: CapabilityResult = {
          capabilityType: 'qa',
          data: { text: fallbackText },
          citations: [],
          status: 'success',
        };

        return { success: true, output: result, textChunks: [fallbackText] };
      }

      const allCitations: Citation[] = [];
      const allChunks: string[] = [];

      for (const kb of knowledgeBases) {
        const retrieveResult = await this.knowledgeService.retrieve(
          { id: ctx.userId, tenantIds: [ctx.tenantId] } as any,
          kb.id,
          ctx.userMessage,
          5,
          0.0,
        );

        for (const r of retrieveResult.results) {
          allCitations.push({
            documentId: r.documentId,
            documentTitle: r.documentTitle,
            chunkId: r.chunkId,
            content: r.content,
            score: r.score,
          });
          allChunks.push(r.content);
        }
      }

      let replyText: string;
      if (allCitations.length === 0) {
        replyText = '未在知识库中找到与您问题相关的内容。请尝试换个角度描述问题，或联系管理员补充相关知识。';
      } else {
        replyText = this.composeAnswer(ctx.userMessage, allCitations);
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
          output: { citationCount: allCitations.length },
        },
      });

      const result: CapabilityResult = {
        capabilityType: 'qa',
        data: { text: replyText },
        citations: allCitations,
        status: 'success',
      };

      return { success: true, output: result, textChunks: chunks };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
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
        data: { text: `问答检索异常：${errorMsg}` },
        citations: [],
        status: 'failed',
        error: errorMsg,
      };

      return { success: false, output: result, error: errorMsg };
    }
  }

  private composeAnswer(question: string, citations: Citation[]): string {
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
