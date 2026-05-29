import { apiFetch } from './api';

export type AuditStatus = 'success' | 'failed' | 'pending';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ToolCallAudit {
  id: string;
  tenantId: string | null;
  toolId: string | null;
  toolName: string;
  callerUserId: string | null;
  callerName: string | null;
  sessionId: string | null;
  taskId: string | null;
  requestSummary: string | null;
  status: AuditStatus;
  errorMessage: string | null;
  durationMs: number | null;
  highRisk: boolean;
  createdAt: string;
}

export interface UserActionAudit {
  id: string;
  tenantId: string | null;
  operatorUserId: string | null;
  operatorName: string | null;
  action: string;
  module: string | null;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  diff: unknown;
  status: AuditStatus;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface ExternalCallAudit {
  id: string;
  tenantId: string | null;
  connectorId: string | null;
  target: string;
  method: string | null;
  callerUserId: string | null;
  sessionId: string | null;
  taskId: string | null;
  requestSummary: string | null;
  status: AuditStatus;
  statusCode: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface RiskAction {
  id: string;
  source: 'tool_call' | 'approval';
  tenantId: string | null;
  action: string;
  operator: string | null;
  status: AuditStatus;
  sessionId: string | null;
  taskId: string | null;
  summary: string | null;
  createdAt: string;
}

type QueryParams = Record<string, string | number | undefined | null>;

const BASE = '/api/v1/audit';

export function listToolCallAudits(
  query: {
    keyword?: string;
    toolName?: string;
    callerUserId?: string;
    status?: AuditStatus;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<ToolCallAudit>>(`${BASE}/tool-calls`, {
    query: query as QueryParams,
  });
}

export function listUserActionAudits(
  query: {
    keyword?: string;
    action?: string;
    module?: string;
    operatorUserId?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<UserActionAudit>>(`${BASE}/user-actions`, {
    query: query as QueryParams,
  });
}

export function listExternalCallAudits(
  query: {
    keyword?: string;
    status?: AuditStatus;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<ExternalCallAudit>>(`${BASE}/external-calls`, {
    query: query as QueryParams,
  });
}

export function listRiskActions(
  query: { keyword?: string; tenantId?: string; page?: number; pageSize?: number } = {},
) {
  return apiFetch<PagedResult<RiskAction>>(`${BASE}/risk-actions`, {
    query: query as QueryParams,
  });
}

const STATUS_META: Record<AuditStatus, { label: string; color: string }> = {
  success: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' },
  pending: { label: '进行中', color: 'blue' },
};

export function statusMeta(status: AuditStatus) {
  return STATUS_META[status] ?? { label: status, color: 'default' };
}
