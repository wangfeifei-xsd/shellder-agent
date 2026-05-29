import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { SseEvent } from './agent-runtime.types';

/**
 * SSE 事件分发服务。
 *
 * 使用 Node.js EventEmitter 实现进程内 SSE 事件分发（V1 单实例足够）。
 * 如后续需多实例水平扩展，可替换为 Redis Pub/Sub。
 *
 * 事件通道以 sessionId 为 key，同一会话的所有 SSE 客户端共享同一通道。
 */
@Injectable()
export class SseEmitterService {
  private readonly logger = new Logger(SseEmitterService.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  emit(sessionId: string, event: SseEvent): void {
    this.emitter.emit(this.channelKey(sessionId), event);
  }

  subscribe(
    sessionId: string,
    listener: (event: SseEvent) => void,
  ): () => void {
    const key = this.channelKey(sessionId);
    this.emitter.on(key, listener);
    return () => {
      this.emitter.removeListener(key, listener);
    };
  }

  listenerCount(sessionId: string): number {
    return this.emitter.listenerCount(this.channelKey(sessionId));
  }

  private channelKey(sessionId: string): string {
    return `sse:${sessionId}`;
  }
}
