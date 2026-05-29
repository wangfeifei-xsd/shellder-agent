import { apiFetch } from './api';

// ── 类型定义 ─────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';
export type ApprovalRiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalItem {
  id: string;
  tenantId: string;
  sessionId: string | null;
  taskId: string | null;
  messageId: string | null;
  initiatorId: string | null;
  initiatorName: string | null;
  actionType: string;
  actionSummary: string | null;
  riskLevel: ApprovalRiskLevel;
  impactScope: string | null;
  toolIds: string[];
  requestContext: Record<string, unknown>;
  status: ApprovalStatus;
  reviewerId: string | null;
  reviewerName: string | null;
  opinion: string | null;
  reviewedAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 展示元数据 ────────────────────────────────────────────

export const APPROVAL_STATUS_META: Record<
  ApprovalStatus,
  { label: string; color: string }
> = {
  pending: { label: '待确认', color: 'orange' },
  approved: { label: '已确认', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  timeout: { label: '已超时', color: 'default' },
};

export const APPROVAL_STATUS_OPTIONS = (
  Object.entries(APPROVAL_STATUS_META) as [
    ApprovalStatus,
    { label: string },
  ][]
).map(([value, m]) => ({ value, label: m.label }));

export const RISK_LEVEL_META: Record<
  ApprovalRiskLevel,
  { label: string; color: string }
> = {
  low: { label: '低风险', color: 'green' },
  medium: { label: '中风险', color: 'orange' },
  high: { label: '高风险', color: 'red' },
};

export const RISK_LEVEL_OPTIONS = (
  Object.entries(RISK_LEVEL_META) as [
    ApprovalRiskLevel,
    { label: string },
  ][]
).map(([value, m]) => ({ value, label: m.label }));

// ── API 客户端 ────────────────────────────────────────────

const BASE = '/api/v1/approvals';

type QueryParams = Record<string, string | number | undefined | null>;

export function listApprovals(
  query: {
    tenantId?: string;
    status?: ApprovalStatus;
    actionType?: string;
    riskLevel?: ApprovalRiskLevel;
    initiatorId?: string;
    reviewerId?: string;
    sessionId?: string;
    startTime?: string;
    endTime?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<ApprovalItem>>(BASE, {
    query: query as QueryParams,
  });
}

export function getApproval(id: string) {
  return apiFetch<ApprovalItem>(`${BASE}/${id}`);
}

export function reviewApproval(
  id: string,
  data: { action: 'approve' | 'reject'; opinion?: string },
) {
  return apiFetch<ApprovalItem>(`${BASE}/${id}/review`, {
    method: 'POST',
    body: data,
  });
}
