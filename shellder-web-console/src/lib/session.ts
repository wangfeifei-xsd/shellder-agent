import { apiFetch } from './api';

// ── 类型定义 ─────────────────────────────────────────────

export type SessionStatus = 'active' | 'completed' | 'failed' | 'cancelled';
export type CapabilityType = 'qa' | 'query' | 'action' | 'workflow';
export type MessageType = 'user' | 'system' | 'tool' | 'confirmation';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface SessionItem {
  id: string;
  tenantId: string;
  userId: string;
  title: string | null;
  status: SessionStatus;
  capabilityType: CapabilityType | null;
  summary: string | null;
  hasTask: boolean;
  hasConfirmation: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageItem {
  id: string;
  sessionId: string;
  type: MessageType;
  role: MessageRole;
  content: Record<string, unknown>;
  seq: number;
  createdAt: string;
}

export interface SessionDetail extends SessionItem {
  messages: MessageItem[];
}

export interface SessionContext {
  sessionId: string;
  tenantId: string;
  userId: string;
  title: string | null;
  status: SessionStatus;
  capabilityType: CapabilityType | null;
  summary: string | null;
  messages: MessageItem[];
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 展示元数据 ────────────────────────────────────────────

export const SESSION_STATUS_META: Record<SessionStatus, { label: string; color: string }> = {
  active: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
};

export const SESSION_STATUS_OPTIONS = (
  Object.entries(SESSION_STATUS_META) as [SessionStatus, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const CAPABILITY_TYPE_META: Record<CapabilityType, { label: string; color: string }> = {
  qa: { label: '问答型', color: 'cyan' },
  query: { label: '查询型', color: 'geekblue' },
  action: { label: '操作型', color: 'orange' },
  workflow: { label: '流程型', color: 'purple' },
};

export const CAPABILITY_TYPE_OPTIONS = (
  Object.entries(CAPABILITY_TYPE_META) as [CapabilityType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const MESSAGE_TYPE_META: Record<MessageType, { label: string; color: string }> = {
  user: { label: '用户', color: 'blue' },
  system: { label: '系统', color: 'green' },
  tool: { label: '工具', color: 'orange' },
  confirmation: { label: '确认', color: 'red' },
};

// ── API 客户端 ────────────────────────────────────────────

const BASE = '/api/v1/sessions';

type QueryParams = Record<string, string | number | undefined | null>;

export interface CreateSessionInput {
  tenantId: string;
  title?: string;
  capabilityType?: CapabilityType;
}

export function createSession(input: CreateSessionInput) {
  return apiFetch<SessionItem>(BASE, { method: 'POST', body: input });
}

export function listSessions(
  query: {
    tenantId?: string;
    userId?: string;
    status?: SessionStatus;
    capabilityType?: CapabilityType;
    startTime?: string;
    endTime?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<SessionItem>>(BASE, { query: query as QueryParams });
}

export function getSession(id: string) {
  return apiFetch<SessionDetail>(`${BASE}/${id}`);
}

export function getSessionContext(id: string, limit?: number) {
  return apiFetch<SessionContext>(`${BASE}/${id}/context`, {
    query: limit ? { limit } : undefined,
  });
}

export function listSessionMessages(
  sessionId: string,
  query: {
    type?: MessageType;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<MessageItem>>(`${BASE}/${sessionId}/messages`, {
    query: query as QueryParams,
  });
}
