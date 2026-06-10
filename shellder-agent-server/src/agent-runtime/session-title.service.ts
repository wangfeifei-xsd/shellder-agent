import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';

const TITLE_MAX_LENGTH = 30;
const FALLBACK_TRUNCATE_LENGTH = 20;
const TITLE_MAX_TOKENS = 32;

const SYSTEM_PROMPT = `你是一个会话标题生成器。根据用户的第一条消息，生成一个简短的中文标题（不超过${TITLE_MAX_LENGTH}个字符）。
要求：
- 提炼核心意图，不要重复原文
- 不加引号、标点、前缀
- 直接输出标题文本`;

@Injectable()
export class SessionTitleService {
  private readonly logger = new Logger(SessionTitleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * 异步为会话生成标题（fire-and-forget）。
   * 仅在 title 为空时执行，失败时 fallback 到截断用户消息。
   */
  async generateTitle(sessionId: string, firstMessage: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { title: true },
    });
    if (session?.title) return;

    let title: string;
    try {
      const result = await this.llmService.chatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: firstMessage.slice(0, 200) },
        ],
        { maxTokens: TITLE_MAX_TOKENS },
      );
      title = result.text.trim().replace(/^["'""'']|["'""'']$/g, '');
      if (!title) throw new Error('LLM 返回空标题');
      if (title.length > TITLE_MAX_LENGTH) {
        title = title.slice(0, TITLE_MAX_LENGTH);
      }
    } catch (err) {
      this.logger.warn(
        `会话标题 LLM 生成失败 session=${sessionId}，使用 fallback：${(err as Error).message}`,
      );
      title = this.fallbackTitle(firstMessage);
    }

    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { title },
      });
    } catch (err) {
      this.logger.warn(`会话标题写入失败 session=${sessionId}：${(err as Error).message}`);
    }
  }

  private fallbackTitle(text: string): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= FALLBACK_TRUNCATE_LENGTH) return cleaned;
    return cleaned.slice(0, FALLBACK_TRUNCATE_LENGTH) + '…';
  }
}
