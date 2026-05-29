import { apiFetch } from './api';

export type ConnectorType = 'db_readonly' | 'http' | 'notification';
export type ConnectorStatus = 'enabled' | 'disabled';
export type ConnectorTestStatus = 'success' | 'failed';
export type AuthType = 'none' | 'basic' | 'bearer' | 'api_key' | 'custom';

export interface Connector {
  id: string;
  tenantId: string;
  name: string;
  type: ConnectorType;
  target: string;
  authType: AuthType;
  timeoutMs: number;
  status: ConnectorStatus;
  description: string | null;
  properties: Record<string, unknown>;
  allowedToolScopes: string[];
  hasSecret: boolean;
  secretMask: Record<string, string>;
  lastTestStatus: ConnectorTestStatus | null;
  lastTestLatencyMs: number | null;
  lastTestMessage: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorRecentCall {
  id: string;
  target: string;
  method: string | null;
  status: 'success' | 'failed' | 'pending';
  statusCode: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ConnectorStats {
  sampleSize: number;
  failureRate: number;
  avgDurationMs: number | null;
  timeoutCount: number;
}

export interface ConnectorDetail extends Connector {
  relatedTools: { id: string; name: string }[];
  stats: ConnectorStats;
  recentCalls: ConnectorRecentCall[];
}

export interface ConnectivityResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  message: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateConnectorInput {
  tenantId: string;
  name: string;
  type: ConnectorType;
  target: string;
  authType?: AuthType;
  timeoutMs?: number;
  properties?: Record<string, unknown>;
  allowedToolScopes?: string[];
  secret?: Record<string, string>;
  description?: string;
}

export type UpdateConnectorInput = Partial<Omit<CreateConnectorInput, 'tenantId'>> & {
  clearSecret?: boolean;
};

type QueryParams = Record<string, string | number | undefined | null>;

const BASE = '/api/v1/connectors';

export function listConnectors(
  query: {
    tenantId?: string;
    type?: ConnectorType;
    status?: ConnectorStatus;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<Connector>>(BASE, { query: query as QueryParams });
}

export function getConnector(id: string) {
  return apiFetch<ConnectorDetail>(`${BASE}/${id}`);
}

export function createConnector(input: CreateConnectorInput) {
  return apiFetch<Connector>(BASE, { method: 'POST', body: input });
}

export function updateConnector(id: string, input: UpdateConnectorInput) {
  return apiFetch<Connector>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateConnectorStatus(id: string, status: ConnectorStatus) {
  return apiFetch<Connector>(`${BASE}/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function deleteConnector(id: string) {
  return apiFetch<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}

export function testConnector(id: string) {
  return apiFetch<ConnectivityResult>(`${BASE}/${id}/test`, { method: 'POST' });
}

// ── 展示元数据 ────────────────────────────────────────────

export const CONNECTOR_TYPE_META: Record<ConnectorType, { label: string; color: string }> = {
  db_readonly: { label: '只读数据库', color: 'geekblue' },
  http: { label: 'HTTP API', color: 'green' },
  notification: { label: '消息通知', color: 'purple' },
};

export const CONNECTOR_TYPE_OPTIONS = (
  Object.entries(CONNECTOR_TYPE_META) as [ConnectorType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const AUTH_TYPE_META: Record<AuthType, { label: string }> = {
  none: { label: '无认证' },
  basic: { label: 'Basic（账号/口令）' },
  bearer: { label: 'Bearer Token' },
  api_key: { label: 'API Key' },
  custom: { label: '自定义 Header' },
};

export const AUTH_TYPE_OPTIONS = (
  Object.entries(AUTH_TYPE_META) as [AuthType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const TEST_STATUS_META: Record<ConnectorTestStatus, { label: string; color: string }> = {
  success: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' },
};
