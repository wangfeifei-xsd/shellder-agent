import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LlmService, StreamDeltaCallback } from '../llm/llm.service';
import { llmNotConfigured } from '../llm/llm.errors';
import { PROMPT_KEYS } from '../prompt/prompt-keys';
import { PromptResolverService } from '../prompt/prompt-resolver.service';
import { buildQueryResultUserVariables } from './query-result.variables';

/** 传给 LLM 的最大行数，避免 token 溢出 */
const MAX_ROWS_FOR_LLM = 50;

export interface QueryResultInput {
  userMessage: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  tenantId?: string;
}

export interface QueryResultOutput {
  replyText: string;
  summary: string;
  truncated: boolean;
  displayedRowCount: number;
}

@Injectable()
export class QueryResultService {
  private readonly logger = new Logger(QueryResultService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly promptResolver: PromptResolverService,
  ) {}

  /**
   * 步骤 ③：将查询结果解读为面向用户的自然语言回复。
   * @param onDelta 可选流式回调（Runtime SSE 用）
   */
  async summarize(
    input: QueryResultInput,
    onDelta?: StreamDeltaCallback,
  ): Promise<QueryResultOutput> {
    try {
      await this.llm.assertConfigured();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw llmNotConfigured();
    }

    const displayedRows = input.rows.slice(0, MAX_ROWS_FOR_LLM);
    const truncated = input.rowCount > displayedRows.length;
    const columns =
      displayedRows.length > 0 ? Object.keys(displayedRows[0]) : [];

    const userVariables = buildQueryResultUserVariables({
      userMessage: input.userMessage,
      rowCount: input.rowCount,
      columns,
      rowsJson: JSON.stringify(displayedRows, null, 2),
      truncated,
      displayedRowCount: displayedRows.length,
    });

    const [systemRendered, userRendered] = await Promise.all([
      this.promptResolver.render({
        promptKey: PROMPT_KEYS.QUERY_RESULT_SYSTEM,
        channel: 'published',
        tenantId: input.tenantId,
        variables: {},
      }),
      this.promptResolver.render({
        promptKey: PROMPT_KEYS.QUERY_RESULT_USER,
        channel: 'published',
        tenantId: input.tenantId,
        variables: userVariables,
      }),
    ]);

    const messages = [
      { role: 'system' as const, content: systemRendered.content },
      { role: 'user' as const, content: userRendered.content },
    ];

    try {
      const result = onDelta
        ? await this.llm.chatCompletionStream(messages, onDelta)
        : await this.llm.chatCompletion(messages);

      const replyText = result.text.trim();
      if (!replyText) {
        throw new BadRequestException({
          code: 'QUERY_RESULT_EMPTY',
          message: 'LLM 未生成有效回复',
        });
      }

      return {
        replyText,
        summary: replyText.slice(0, 200),
        truncated,
        displayedRowCount: displayedRows.length,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(
        `结果解读失败：${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException({
        code: 'QUERY_RESULT_FAILED',
        message: `查询结果解读失败：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
