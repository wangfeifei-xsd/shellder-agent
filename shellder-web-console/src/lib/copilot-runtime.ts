/**
 * Copilot Runtime 编排封装（能力演示与嵌入共用契约）。
 */

import { apiFetch } from './api';
import {
  type CapabilityResult,
  type CapabilityTypeKey,
  type CopilotMessage,
  type CopilotTokenResponse,
  copilotCreateSession,
  copilotGetSession,
  copilotSendMessage,
  findLastAssistantCapabilityResult,
} from './copilot';
import { connectCopilotSse } from './copilot-sse';

export interface CopilotStreamRoundResult {
  sessionId: string;
  messageId: string;
  streamText: string;
  capabilityResult: CapabilityResult | null;
  sessionCapabilityType: string | null;
  error?: string;
  pendingConfirm?: {
    approvalId: string;
    reason: string;
    toolName?: string;
  };
}

/** 管理端能力演示 — 代换 Copilot JWT（响应与 /copilot/v1/auth/token 一致） */
export async function fetchCapabilityDemoCopilotToken(params: {
  tenantId: string;
  copilotConfigId: string;
  externalUserId?: string;
  scopeList?: string[];
}): Promise<CopilotTokenResponse> {
  return apiFetch<CopilotTokenResponse>('/api/v1/capabilities/demo/copilot-token', {
    method: 'POST',
    body: params,
  });
}

/**
 * 与嵌入一致：先连 SSE → POST messages(mode=stream) → 等 done → GET session 解析 CapabilityResult。
 */
export async function runCopilotStreamRound(params: {
  token: string;
  content: string;
  sessionId?: string | null;
  /** 新建会话时定向选择的能力类型（不走路由匹配） */
  capabilityType?: CapabilityTypeKey;
  onDelta?: (text: string) => void;
}): Promise<CopilotStreamRoundResult> {
  const { token, content, onDelta, capabilityType } = params;
  let sessionId = params.sessionId ?? null;

  if (!sessionId) {
    const session = await copilotCreateSession(token, {
      title: '业务调试',
      capabilityType,
    });
    sessionId = session.id;
  }

  let streamText = '';
  let done = false;
  let runtimeError: string | undefined;
  let pendingConfirm: CopilotStreamRoundResult['pendingConfirm'];

  const closeSse = connectCopilotSse(sessionId, token, (type, data) => {
    if (type === 'delta' && typeof data.text === 'string') {
      streamText += data.text;
      onDelta?.(data.text);
    }
    if (type === 'confirm_required') {
      pendingConfirm = {
        approvalId: String(data.approvalId ?? ''),
        reason: String(data.reason ?? '需要人工确认'),
        toolName: data.toolName ? String(data.toolName) : undefined,
      };
      done = true;
    }
    if (type === 'done') {
      done = true;
    }
    if (type === 'error') {
      runtimeError = String(data.message ?? '处理失败');
      done = true;
    }
  });

  try {
    const sendRes = await copilotSendMessage(token, sessionId, content, 'stream');

    // 与 Runtime 能力超时（basic.defaultTimeoutMs 默认 300s，query 不低于 180s）对齐并留缓冲
    const deadline = Date.now() + 360_000;
    while (!done && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 80));
    }
    if (!done) {
      runtimeError = '执行超时，请稍后刷新会话查看结果';
    }

    const detail = await copilotGetSession(token, sessionId);
    const capabilityResult = findLastAssistantCapabilityResult(detail.messages);

    return {
      sessionId,
      messageId: sendRes.messageId,
      streamText,
      capabilityResult,
      sessionCapabilityType: detail.capabilityType,
      error: runtimeError,
      pendingConfirm,
    };
  } finally {
    closeSse();
  }
}

export function mergeStreamIntoMessages(
  messages: CopilotMessage[],
  streamText: string,
  tempId = '__streaming__',
): CopilotMessage[] {
  if (!streamText) return messages;
  const without = messages.filter((m) => m.id !== tempId);
  return [
    ...without,
    {
      id: tempId,
      type: 'system',
      role: 'assistant',
      content: { text: streamText },
      seq: without.length + 1,
      createdAt: new Date().toISOString(),
    },
  ];
}
