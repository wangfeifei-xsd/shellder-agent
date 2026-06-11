import { apiFetch } from './api';

// ── 类型定义 ─────────────────────────────────────────────

export type OpenApiAppStatus = 'enabled' | 'disabled';
export type OpenApiCallStatus = 'success' | 'failed' | 'rate_limited';
export type CapabilityType = 'qa' | 'query' | 'action' | 'workflow';

export interface OpenApiAppItem {
  id: string;
  name: string;
  description: string | null;
  clientId: string;
  status: OpenApiAppStatus;
  allowedTenantIds: string[];
  allowedCapabilities: CapabilityType[];
  rateLimitConfig: { rateLimit: number; windowMs: number } | null;
  lastCalledAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenApiAppCreated extends OpenApiAppItem {
  clientSecret: string;
}

export interface OpenApiCallLogItem {
  id: string;
  appId: string;
  appName: string;
  tenantId: string | null;
  method: string;
  path: string;
  statusCode: number;
  status: OpenApiCallStatus;
  ip: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  requestSummary: string | null;
  createdAt: string;
}

export interface CallStats {
  total: number;
  success: number;
  failed: number;
  rateLimited: number;
  successRate: number;
  errorRate: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 展示元数据 ────────────────────────────────────────────

export const APP_STATUS_META: Record<
  OpenApiAppStatus,
  { label: string; color: string }
> = {
  enabled: { label: '已启用', color: 'success' },
  disabled: { label: '已禁用', color: 'default' },
};

export const APP_STATUS_OPTIONS = (
  Object.entries(APP_STATUS_META) as [OpenApiAppStatus, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const CALL_STATUS_META: Record<
  OpenApiCallStatus,
  { label: string; color: string }
> = {
  success: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  rate_limited: { label: '限流', color: 'warning' },
};

export const CALL_STATUS_OPTIONS = (
  Object.entries(CALL_STATUS_META) as [OpenApiCallStatus, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const CAPABILITY_META: Record<
  CapabilityType,
  { label: string; color: string }
> = {
  qa: { label: '问答型', color: 'blue' },
  query: { label: '查询型', color: 'green' },
  action: { label: '操作型', color: 'orange' },
  workflow: { label: '流程型', color: 'purple' },
};

export const CAPABILITY_OPTIONS = (
  Object.entries(CAPABILITY_META) as [CapabilityType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

// ── API 客户端 ────────────────────────────────────────────

const BASE = '/api/v1/openapi-apps';
const LOG_BASE = '/api/v1/openapi-call-logs';

type QueryParams = Record<string, string | number | undefined | null>;

export function listOpenApiApps(
  query: {
    tenantId?: string;
    keyword?: string;
    status?: OpenApiAppStatus;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<OpenApiAppItem>>(BASE, {
    query: query as QueryParams,
  });
}

export function getOpenApiApp(id: string) {
  return apiFetch<OpenApiAppItem>(`${BASE}/${id}`);
}

export function createOpenApiApp(data: {
  name: string;
  description?: string;
  allowedTenantIds: string[];
  allowedCapabilities: CapabilityType[];
  rateLimitConfig?: { rateLimit: number; windowMs: number };
}) {
  return apiFetch<OpenApiAppCreated>(BASE, { method: 'POST', body: data });
}

export function updateOpenApiApp(
  id: string,
  data: {
    name?: string;
    description?: string;
    status?: OpenApiAppStatus;
    allowedTenantIds?: string[];
    allowedCapabilities?: CapabilityType[];
    rateLimitConfig?: { rateLimit: number; windowMs: number } | null;
  },
) {
  return apiFetch<OpenApiAppItem>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

export function resetOpenApiAppSecret(id: string) {
  return apiFetch<OpenApiAppCreated>(`${BASE}/${id}/reset-secret`, {
    method: 'POST',
  });
}

export function deleteOpenApiApp(id: string) {
  return apiFetch<{ ok: boolean }>(`${BASE}/${id}`, { method: 'DELETE' });
}

export function getOpenApiAppStats(id: string) {
  return apiFetch<CallStats>(`${BASE}/${id}/stats`);
}

export function getOpenApiAppCallLogs(
  id: string,
  query: {
    status?: OpenApiCallStatus;
    startTime?: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<OpenApiCallLogItem>>(
    `${BASE}/${id}/call-logs`,
    { query: query as QueryParams },
  );
}

export function listOpenApiCallLogs(
  query: {
    appId?: string;
    tenantId?: string;
    status?: OpenApiCallStatus;
    path?: string;
    startTime?: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<OpenApiCallLogItem>>(LOG_BASE, {
    query: query as QueryParams,
  });
}

export function getCallLogStats(appId?: string) {
  return apiFetch<CallStats>(`${LOG_BASE}/stats`, {
    query: { appId } as QueryParams,
  });
}
