/**
 * Copilot Widget API 客户端
 * 用于嵌入式 Copilot 前端与后端 /copilot/v1 接口交互。
 */

import { resolveApiOrigin } from './api';

const COPILOT_BASE = `${resolveApiOrigin()}/copilot/v1`;

export interface CopilotConfig {
  theme?: Record<string, unknown>;
  features?: { enableHistory?: boolean; enableTask?: boolean; enableConfirmation?: boolean };
  welcomeMessage?: string | null;
  placeholder?: string | null;
  maxHistoryMessages?: number;
}

export interface CopilotTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  tenantId: string;
  config: CopilotConfig;
}

export interface CopilotSession {
  id: string;
  title: string | null;
  status: string;
  capabilityType: string | null;
  summary: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface CopilotCitation {
  documentId?: string;
  documentTitle?: string;
  chunkId?: string;
  content: string;
  score?: number;
}

export interface CopilotMessage {
  id: string;
  type: string;
  role: string;
  content: Record<string, unknown>;
  seq: number;
  createdAt: string;
}

export interface CopilotSessionTask {
  id: string;
  title: string | null;
  type: string;
  status: string;
  capabilityType: string | null;
  currentNode: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CopilotSessionDetail extends CopilotSession {
  messages: CopilotMessage[];
  tasks?: CopilotSessionTask[];
}

export interface CopilotConfirmation {
  id: string;
  sessionId: string | null;
  taskId: string | null;
  actionType: string;
  actionSummary: string | null;
  riskLevel: string;
  impactScope: string | null;
  status: string;
  createdAt: string;
}

export interface CopilotTaskStep {
  id: string;
  seq: number;
  name: string | null;
  status: string;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CopilotTask {
  id: string;
  sessionId: string | null;
  title: string | null;
  type: string;
  status: string;
  capabilityType: string | null;
  currentNode: string | null;
  output: unknown;
  failReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  steps: CopilotTaskStep[];
}

export interface CopilotSendMessageResult {
  messageId: string;
  assistantMessageId?: string;
  taskId?: string;
  capabilityType?: string;
  reply?: Record<string, unknown>;
}

/** 与 server capability-result.ts / 嵌入消息 content 对齐 */
export type CapabilityTypeKey = 'qa' | 'query' | 'action' | 'workflow';

/** 问答型 data.merged_media / injected_context（与 wiki recall、知识库测试一致） */
export interface QaRecallMediaRef {
  code: string;
  mime: string;
  size: number;
  title?: string | null;
}

export interface QaRecallMediaBundle {
  injected_context: string;
  merged_media: QaRecallMediaRef[];
}

export interface CapabilityResult {
  capabilityType: CapabilityTypeKey;
  data: Record<string, unknown>;
  citations?: CopilotCitation[];
  steps?: {
    seq: number;
    name: string;
    status: string;
    durationMs?: number;
    error?: string;
    toolName?: string;
  }[];
  status: 'success' | 'failed' | 'partial' | 'pending_confirm';
  error?: string;
}

function copilotHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function readCopilotJson<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const body = (data ?? {}) as { message?: string; code?: string };
    const detail =
      body.message ??
      body.code ??
      (text.trim().slice(0, 300) || `HTTP ${res.status}`);
    throw new Error(`${fallback}：${detail}`);
  }

  if (!text.trim()) {
    throw new Error(`${fallback}：服务端返回空响应`);
  }
  if (data === null) {
    throw new Error(
      `${fallback}：响应不是合法 JSON${text.trim() ? `（${text.trim().slice(0, 120)}）` : ''}`,
    );
  }

  return data as T;
}

export async function copilotExchangeToken(params: {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  externalTenantId?: string;
  externalUserId?: string;
  /** 数据可见范围；空或未传表示不按范围过滤 */
  scopeList?: string[];
  /** 问答型 wiki 子目录范围（层内相对路径）；空或未传表示租户 wiki 全目录 */
  wikiPrefixes?: string[];
}): Promise<CopilotTokenResponse> {
  const res = await fetch(`${COPILOT_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return readCopilotJson<CopilotTokenResponse>(res, '换票失败');
}

export async function copilotCreateSession(
  token: string,
  options?: { title?: string; capabilityType?: CapabilityTypeKey },
): Promise<CopilotSession> {
  const res = await fetch(`${COPILOT_BASE}/sessions`, {
    method: 'POST',
    headers: copilotHeaders(token),
    body: JSON.stringify({
      title: options?.title,
      capabilityType: options?.capabilityType,
    }),
  });
  return readCopilotJson<CopilotSession>(res, '创建会话失败');
}

export async function copilotListSessions(
  token: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: CopilotSession[]; total: number }> {
  const res = await fetch(`${COPILOT_BASE}/sessions?page=${page}&pageSize=${pageSize}`, {
    headers: copilotHeaders(token),
  });
  return readCopilotJson<{ items: CopilotSession[]; total: number }>(
    res,
    '获取会话列表失败',
  );
}

export async function copilotGetSession(
  token: string,
  sessionId: string,
): Promise<CopilotSessionDetail> {
  const res = await fetch(`${COPILOT_BASE}/sessions/${sessionId}`, {
    headers: copilotHeaders(token),
  });
  return readCopilotJson<CopilotSessionDetail>(res, '获取会话失败');
}

export async function copilotSendMessage(
  token: string,
  sessionId: string,
  content: string,
  mode: 'sync' | 'stream' = 'stream',
): Promise<CopilotSendMessageResult> {
  const res = await fetch(`${COPILOT_BASE}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: copilotHeaders(token),
    body: JSON.stringify({ content, mode }),
  });
  return readCopilotJson<CopilotSendMessageResult>(res, '发送消息失败');
}

/** EventSource 无法携带 Authorization，通过 query token 鉴权 */
export function copilotBuildSseUrl(sessionId: string, token: string): string {
  const qs = new URLSearchParams({ token });
  return `${COPILOT_BASE}/sessions/${sessionId}/stream?${qs.toString()}`;
}

export async function copilotListConfirmations(
  token: string,
  status?: string,
): Promise<CopilotConfirmation[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${COPILOT_BASE}/confirmations${qs}`, {
    headers: copilotHeaders(token),
  });
  return readCopilotJson<CopilotConfirmation[]>(res, '获取待确认列表失败');
}

export async function copilotSubmitConfirmation(
  token: string,
  id: string,
  action: 'approve' | 'reject',
  opinion?: string,
): Promise<{ id: string; status: string; resumed?: boolean }> {
  const res = await fetch(`${COPILOT_BASE}/confirmations/${id}`, {
    method: 'POST',
    headers: copilotHeaders(token),
    body: JSON.stringify({ action, opinion }),
  });
  return readCopilotJson<{ id: string; status: string; resumed?: boolean }>(
    res,
    '提交确认失败',
  );
}

export async function copilotGetTask(
  token: string,
  taskId: string,
): Promise<CopilotTask> {
  const res = await fetch(`${COPILOT_BASE}/tasks/${taskId}`, {
    headers: copilotHeaders(token),
  });
  return readCopilotJson<CopilotTask>(res, '获取任务失败');
}

/** 嵌入对话中不展示的消息（如定向选择产生的路由元数据） */
export function isHiddenCopilotChatMessage(message: CopilotMessage): boolean {
  return message.content?.type === 'routing_result';
}

/** 从消息 content 提取展示文本 */
export function extractMessageText(content: Record<string, unknown>): string {
  if (content.type === 'routing_result') return '';
  if (typeof content.text === 'string') return content.text;
  const data = content.data as Record<string, unknown> | undefined;
  if (data && typeof data.text === 'string') return data.text;
  if (typeof content.reason === 'string') return content.reason;
  return JSON.stringify(content, null, 2);
}

/** 从 CapabilityResult 提取知识库召回媒体（问答型） */
export function extractQaRecallMediaBundle(
  result: CapabilityResult | null,
): QaRecallMediaBundle | null {
  if (!result || result.capabilityType !== 'qa') return null;
  const data = result.data;
  const merged_media = Array.isArray(data.merged_media)
    ? (data.merged_media as QaRecallMediaRef[])
    : [];
  const injected_context =
    typeof data.injected_context === 'string' ? data.injected_context : '';
  if (!injected_context.trim() && merged_media.length === 0) return null;
  return { injected_context, merged_media };
}

/** Copilot 下按 code 获取问答召回媒体 object URL（调用方需在不用时 revoke） */
export async function copilotFetchMediaObjectUrl(
  token: string,
  code: string,
): Promise<string> {
  const res = await fetch(`${COPILOT_BASE}/media/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`加载媒体失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** 从消息 content 提取引用（问答型 CapabilityResult） */
export function extractCitations(content: Record<string, unknown>): CopilotCitation[] {
  const citations = content.citations;
  if (Array.isArray(citations)) {
    return citations as CopilotCitation[];
  }
  return [];
}

const CAPABILITY_TYPES: CapabilityTypeKey[] = ['qa', 'query', 'action', 'workflow'];
const CAPABILITY_STATUSES = ['success', 'failed', 'partial', 'pending_confirm'] as const;

/** 从助手消息 content 解析完整 CapabilityResult（与嵌入金标准一致） */
export function parseCapabilityResult(
  content: Record<string, unknown>,
): CapabilityResult | null {
  const capabilityType = content.capabilityType;
  const status = content.status;
  if (
    typeof capabilityType !== 'string' ||
    !CAPABILITY_TYPES.includes(capabilityType as CapabilityTypeKey) ||
    typeof status !== 'string' ||
    !CAPABILITY_STATUSES.includes(status as (typeof CAPABILITY_STATUSES)[number])
  ) {
    return null;
  }

  const data = content.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null;
  }

  return {
    capabilityType: capabilityType as CapabilityTypeKey,
    data: data as Record<string, unknown>,
    citations: Array.isArray(content.citations)
      ? (content.citations as CopilotCitation[])
      : undefined,
    steps: Array.isArray(content.steps)
      ? (content.steps as CapabilityResult['steps'])
      : undefined,
    status: status as CapabilityResult['status'],
    error: typeof content.error === 'string' ? content.error : undefined,
  };
}

/** 从会话消息列表取最后一条可解析的 CapabilityResult */
export function findLastAssistantCapabilityResult(
  messages: CopilotMessage[],
): CapabilityResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' || msg.type === 'confirmation') continue;
    if (msg.content.type === 'routing_result') continue;
    const parsed = parseCapabilityResult(msg.content);
    if (parsed) return parsed;
  }
  return null;
}
