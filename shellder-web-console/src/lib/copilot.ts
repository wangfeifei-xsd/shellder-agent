/**
 * Copilot Widget API 客户端
 * 用于嵌入式 Copilot 前端与后端 /copilot/v1 接口交互。
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const COPILOT_BASE = `${API_BASE}/copilot/v1`;

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

function copilotHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseCopilotError(res: Response, fallback: string): Promise<never> {
  try {
    const body = await res.json();
    throw new Error(body.message ?? body.code ?? fallback);
  } catch (e) {
    if (e instanceof Error && e.message !== fallback) throw e;
    throw new Error(`${fallback}：${res.status}`);
  }
}

export async function copilotExchangeToken(params: {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  externalTenantId?: string;
  externalUserId?: string;
}): Promise<CopilotTokenResponse> {
  const res = await fetch(`${COPILOT_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) await parseCopilotError(res, '换票失败');
  return res.json();
}

export async function copilotCreateSession(
  token: string,
  title?: string,
): Promise<CopilotSession> {
  const res = await fetch(`${COPILOT_BASE}/sessions`, {
    method: 'POST',
    headers: copilotHeaders(token),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) await parseCopilotError(res, '创建会话失败');
  return res.json();
}

export async function copilotListSessions(
  token: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: CopilotSession[]; total: number }> {
  const res = await fetch(`${COPILOT_BASE}/sessions?page=${page}&pageSize=${pageSize}`, {
    headers: copilotHeaders(token),
  });
  if (!res.ok) await parseCopilotError(res, '获取会话列表失败');
  return res.json();
}

export async function copilotGetSession(
  token: string,
  sessionId: string,
): Promise<CopilotSessionDetail> {
  const res = await fetch(`${COPILOT_BASE}/sessions/${sessionId}`, {
    headers: copilotHeaders(token),
  });
  if (!res.ok) await parseCopilotError(res, '获取会话失败');
  return res.json();
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
  if (!res.ok) await parseCopilotError(res, '发送消息失败');
  return res.json();
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
  if (!res.ok) await parseCopilotError(res, '获取待确认列表失败');
  return res.json();
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
  if (!res.ok) await parseCopilotError(res, '提交确认失败');
  return res.json();
}

export async function copilotGetTask(
  token: string,
  taskId: string,
): Promise<CopilotTask> {
  const res = await fetch(`${COPILOT_BASE}/tasks/${taskId}`, {
    headers: copilotHeaders(token),
  });
  if (!res.ok) await parseCopilotError(res, '获取任务失败');
  return res.json();
}

/** 从消息 content 提取展示文本 */
export function extractMessageText(content: Record<string, unknown>): string {
  if (typeof content.text === 'string') return content.text;
  const data = content.data as Record<string, unknown> | undefined;
  if (data && typeof data.text === 'string') return data.text;
  if (typeof content.reason === 'string') return content.reason;
  return JSON.stringify(content, null, 2);
}

/** 从消息 content 提取引用（问答型 CapabilityResult） */
export function extractCitations(content: Record<string, unknown>): CopilotCitation[] {
  const citations = content.citations;
  if (Array.isArray(citations)) {
    return citations as CopilotCitation[];
  }
  return [];
}
