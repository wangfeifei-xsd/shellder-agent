/**
 * Copilot SSE 连接（与嵌入页 /copilot 一致的事件类型）。
 */

import { copilotBuildSseUrl } from './copilot';

export type CopilotSseHandler = (type: string, data: Record<string, unknown>) => void;

const RUNTIME_EVENT_TYPES = [
  'delta',
  'tool_start',
  'tool_end',
  'confirm_required',
  'done',
  'error',
  'session.connected',
  'session.snapshot_end',
  'message',
] as const;

/**
 * 订阅会话 SSE。返回 close 函数。
 */
export function connectCopilotSse(
  sessionId: string,
  token: string,
  onEvent: CopilotSseHandler,
  options?: { reconnectOnError?: boolean; getToken?: () => string | null },
): () => void {
  let es: EventSource | null = null;
  let closed = false;

  const open = () => {
    if (closed) return;
    const authToken = options?.getToken?.() ?? token;
    if (!authToken) return;

    es = new EventSource(copilotBuildSseUrl(sessionId, authToken));

    for (const type of RUNTIME_EVENT_TYPES) {
      es.addEventListener(type, (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as Record<string, unknown>;
          onEvent(type, data);
        } catch {
          // ignore malformed payload
        }
      });
    }

    es.onerror = () => {
      if (closed || es === null) return;
      es.close();
      es = null;
      if (options?.reconnectOnError !== false) {
        setTimeout(() => {
          if (!closed) open();
        }, 3000);
      }
    };
  };

  open();

  return () => {
    closed = true;
    if (es) {
      es.close();
      es = null;
    }
  };
}
