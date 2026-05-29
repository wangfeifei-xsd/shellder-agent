import { Logger } from '@nestjs/common';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from './agent-runtime.types';

/**
 * 能力 Handler 注册表 + Phase 12 Mock 骨架。
 *
 * Phase 13（四类业务能力）将为每种能力提供真实实现，
 * 通过 registerHandler() 替换此处的 Mock 逻辑。
 */

const logger = new Logger('CapabilityHandlers');

class MockQaHandler implements CapabilityHandler {
  readonly type = 'qa';

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    const reply = `[Mock QA] 收到问题：「${ctx.userMessage}」。问答型能力处理中...（Phase 13 将接入知识库召回）`;

    const chunks = this.splitText(reply, 10);
    for (const chunk of chunks) {
      emitSse({ event: 'delta', data: { text: chunk } });
      await this.delay(50);
    }

    return { success: true, output: { text: reply }, textChunks: chunks };
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

class MockQueryHandler implements CapabilityHandler {
  readonly type = 'query';

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    emitSse({
      event: 'delta',
      data: { text: '[Mock Query] 查询型能力处理中...\n' },
    });
    await new Promise((r) => setTimeout(r, 100));
    emitSse({
      event: 'delta',
      data: {
        text: `SQL Query Tool 将在 Phase 13 实现。用户输入：${ctx.userMessage}`,
      },
    });

    return {
      success: true,
      output: { text: 'Mock 查询结果', rows: [] },
    };
  }
}

class MockActionHandler implements CapabilityHandler {
  readonly type = 'action';

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    emitSse({
      event: 'delta',
      data: { text: '[Mock Action] 操作型能力处理中...\n' },
    });
    await new Promise((r) => setTimeout(r, 100));
    emitSse({
      event: 'delta',
      data: {
        text: `Action Tool 将在 Phase 13 实现。用户输入：${ctx.userMessage}`,
      },
    });

    return { success: true, output: { text: 'Mock 操作结果' } };
  }
}

class MockWorkflowHandler implements CapabilityHandler {
  readonly type = 'workflow';

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    emitSse({
      event: 'delta',
      data: { text: '[Mock Workflow] 流程型能力处理中...\n' },
    });
    await new Promise((r) => setTimeout(r, 100));
    emitSse({
      event: 'delta',
      data: {
        text: `Workflow Tool 将在 Phase 13 实现。用户输入：${ctx.userMessage}`,
      },
    });

    return { success: true, output: { text: 'Mock 流程结果' } };
  }
}

const handlerRegistry = new Map<string, CapabilityHandler>();

handlerRegistry.set('qa', new MockQaHandler());
handlerRegistry.set('query', new MockQueryHandler());
handlerRegistry.set('action', new MockActionHandler());
handlerRegistry.set('workflow', new MockWorkflowHandler());

export function getCapabilityHandler(
  type: string,
): CapabilityHandler | undefined {
  return handlerRegistry.get(type);
}

export function registerCapabilityHandler(handler: CapabilityHandler): void {
  logger.log(`注册能力 Handler：${handler.type}`);
  handlerRegistry.set(handler.type, handler);
}
