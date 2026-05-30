import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { QaPipelineService } from './qa-pipeline.service';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from '../agent-runtime/agent-runtime.types';
import { CapabilityResult } from './capability-result';

/**
 * 问答型能力 Handler（§5.1）。
 *
 * 两阶段：pathy dialogue/recall（仅召回）→ 平台 LlmService 流式生成。
 */
@Injectable()
export class QaCapabilityHandler implements CapabilityHandler {
  readonly type = 'qa';
  private readonly logger = new Logger(QaCapabilityHandler.name);

  constructor(
    private readonly qaPipeline: QaPipelineService,
    private readonly llmService: LlmService,
  ) {}

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    const startTime = Date.now();

    try {
      await this.llmService.assertConfigured();
    } catch (err) {
      const errorMsg = this.qaPipeline.formatProxyError(err);
      this.logger.error(`QA 能力执行失败：${errorMsg}`);
      const result: CapabilityResult = {
        capabilityType: 'qa',
        data: { text: errorMsg },
        citations: [],
        status: 'failed',
        error: errorMsg,
      };
      return { success: false, output: result, error: errorMsg };
    }

    emitSse({
      event: 'tool_start',
      data: { toolName: 'knowledge_recall', input: { query: ctx.userMessage } },
    });

    try {
      const textChunks: string[] = [];
      const pipelineResult = await this.qaPipeline.runStream(
        {
          tenantId: ctx.tenantId,
          userMessage: ctx.userMessage,
        },
        async (delta) => {
          textChunks.push(delta);
          emitSse({ event: 'delta', data: { text: delta } });
        },
      );

      const durationMs = Date.now() - startTime;
      emitSse({
        event: 'tool_end',
        data: {
          toolName: 'knowledge_recall',
          status: 'success',
          durationMs,
          output: {
            citationCount: pipelineResult.citations.length,
            recallMethod: pipelineResult.recall.recall_method,
            filesScanned: (pipelineResult.recall as { files_scanned?: number }).files_scanned,
            model: pipelineResult.model,
          },
        },
      });

      const result: CapabilityResult = {
        capabilityType: 'qa',
        data: { text: pipelineResult.replyText },
        citations: pipelineResult.citations,
        status: 'success',
      };

      return { success: true, output: result, textChunks };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = this.qaPipeline.formatProxyError(err);
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
}
