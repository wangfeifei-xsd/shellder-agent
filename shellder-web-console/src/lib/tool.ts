import { apiFetch } from './api';

export type ToolType = 'query' | 'action' | 'workflow' | 'notification';
export type ToolStatus = 'enabled' | 'disabled';
export type ToolRiskLevel = 'low' | 'medium' | 'high';

export interface SqlTemplate {
  id: string;
  name: string;
  sql: string;
  description?: string;
}

export interface SqlToolConfig {
  /** 禁止访问的表；空数组表示不限制（仅受只读约束） */
  tableBlacklist: string[];
  /** 禁止访问的字段；空数组表示不限制 */
  fieldBlacklist: string[];
  maxRows: number;
  maxExecutionMs: number;
  templates: SqlTemplate[];
}

/** 历史 config 可能仍含表白名单字段 */
export type LegacySqlToolConfig = SqlToolConfig & {
  tableWhitelist?: string[];
  fieldWhitelist?: string[];
};

export interface HttpToolConfig {
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyTemplate?: unknown;
}

export interface WorkflowToolConfig {
  steps: { name: string; toolId?: string; description?: string }[];
}

export interface ToolConfig {
  sql?: SqlToolConfig;
  http?: HttpToolConfig;
  workflow?: WorkflowToolConfig;
}

export interface ToolConnectorRef {
  id: string;
  name: string;
  type: string;
  status: string;
}

export interface Tool {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  type: ToolType;
  status: ToolStatus;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  permissionScope: string | null;
  riskLevel: ToolRiskLevel;
  needConfirmation: boolean;
  timeoutMs: number;
  idempotencyKey: string | null;
  auditEventType: string | null;
  connectorId: string | null;
  connector: ToolConnectorRef | null;
  config: ToolConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ToolStats {
  sampleSize: number;
  successRate: number;
  failureRate: number;
  avgDurationMs: number | null;
}

export interface ToolRecentCall {
  id: string;
  status: 'success' | 'failed' | 'pending';
  callerName: string | null;
  requestSummary: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  highRisk: boolean;
  createdAt: string;
}

export interface ErPublishedSummary {
  tableCount: number;
  relationshipCount: number;
  version: number | null;
  publishedAt: string | null;
}

export interface ToolDetail extends Tool {
  stats: ToolStats;
  recentCalls: ToolRecentCall[];
  erPublishedSummary?: ErPublishedSummary | null;
}

export interface MatchedRule {
  ruleId: string;
  name: string;
  type: string;
  action: string;
  priority: number;
}

export interface PolicyDecision {
  allow: boolean;
  needConfirm: boolean;
  highRisk: boolean;
  result: 'allow' | 'deny' | 'need_confirm';
  matchedRules: MatchedRule[];
  reason?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ToolTestResult {
  policy: PolicyDecision;
  inputValidation: SchemaValidationResult;
  outputValidation?: SchemaValidationResult;
  executed: boolean;
  status: 'success' | 'failed' | 'denied' | 'need_confirm' | 'skipped';
  rawRequest?: unknown;
  rawResponse?: unknown;
  transformedResult?: unknown;
  durationMs: number;
  message: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateToolInput {
  tenantId: string;
  name: string;
  description?: string;
  type: ToolType;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permissionScope?: string;
  riskLevel?: ToolRiskLevel;
  needConfirmation?: boolean;
  timeoutMs?: number;
  idempotencyKey?: string;
  auditEventType?: string;
  connectorId?: string;
  config?: ToolConfig;
}

export type UpdateToolInput = Partial<Omit<CreateToolInput, 'tenantId'>>;

type QueryParams = Record<string, string | number | undefined | null>;

const BASE = '/api/v1/tools';

export function listTools(
  query: {
    tenantId?: string;
    type?: ToolType;
    status?: ToolStatus;
    riskLevel?: ToolRiskLevel;
    connectorId?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<Tool>>(BASE, { query: query as QueryParams });
}

export function getTool(id: string) {
  return apiFetch<ToolDetail>(`${BASE}/${id}`);
}

export function createTool(input: CreateToolInput) {
  return apiFetch<Tool>(BASE, { method: 'POST', body: input });
}

export function updateTool(id: string, input: UpdateToolInput) {
  return apiFetch<Tool>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateToolStatus(id: string, status: ToolStatus) {
  return apiFetch<Tool>(`${BASE}/${id}/status`, { method: 'PATCH', body: { status } });
}

export function deleteTool(id: string) {
  return apiFetch<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}

export function testTool(id: string, params: Record<string, unknown>) {
  return apiFetch<ToolTestResult>(`${BASE}/${id}/test`, {
    method: 'POST',
    body: { params },
  });
}

export interface QueryPrincipalContextInput {
  externalUserId?: string;
  scopeList?: string[];
}

export function sqlTestTool(
  id: string,
  input: {
    sql?: string;
    templateId?: string;
    params?: Record<string, unknown>;
  } & QueryPrincipalContextInput,
) {
  return apiFetch<ToolTestResult>(`${BASE}/${id}/sql-test`, {
    method: 'POST',
    body: input,
  });
}

export interface Nl2SqlPreviewResult {
  sql: string;
  explanation: string;
  referencedTables: string[];
  params: Record<string, unknown>;
  scopeContext?: string;
}

export function nl2sqlPreviewTool(
  id: string,
  message: string,
  principal?: QueryPrincipalContextInput,
) {
  return apiFetch<Nl2SqlPreviewResult>(`${BASE}/${id}/nl2sql-preview`, {
    method: 'POST',
    body: { message, ...principal },
  });
}

export interface QueryE2ePreviewResult {
  nl2sql: Nl2SqlPreviewResult;
  execution: {
    rowCount: number;
    rows: Record<string, unknown>[];
    executedSql: string;
    durationMs: number;
  };
  reply: {
    text: string;
    summary: string;
    truncated: boolean;
    displayedRowCount: number;
  };
  dataScope?: {
    scopeContextText: string;
    appliedScopeFilters: string[];
  };
  totalDurationMs: number;
}

export function queryE2ePreviewTool(
  id: string,
  message: string,
  principal?: QueryPrincipalContextInput,
) {
  return apiFetch<QueryE2ePreviewResult>(`${BASE}/${id}/query-e2e-preview`, {
    method: 'POST',
    body: { message, ...principal },
  });
}

// ── 展示元数据 ────────────────────────────────────────────

export const TOOL_TYPE_META: Record<ToolType, { label: string; color: string }> = {
  query: { label: '查询型', color: 'geekblue' },
  action: { label: '操作型', color: 'volcano' },
  workflow: { label: '流程型', color: 'purple' },
  notification: { label: '通知型', color: 'cyan' },
};

export const TOOL_TYPE_OPTIONS = (
  Object.entries(TOOL_TYPE_META) as [ToolType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

/** 工具管理列表：不含查询型（查询型在『查询型』配置 → 数据库连接工具维护） */
export const TOOL_TYPE_OPTIONS_EXCLUDING_QUERY = TOOL_TYPE_OPTIONS.filter((o) => o.value !== 'query');

/** 数据库连接工具：仅查询型 */
export const TOOL_TYPE_OPTIONS_QUERY_ONLY = TOOL_TYPE_OPTIONS.filter((o) => o.value === 'query');

export const RISK_LEVEL_META: Record<ToolRiskLevel, { label: string; color: string }> = {
  low: { label: '低', color: 'green' },
  medium: { label: '中', color: 'gold' },
  high: { label: '高', color: 'red' },
};

export const RISK_LEVEL_OPTIONS = (
  Object.entries(RISK_LEVEL_META) as [ToolRiskLevel, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

/** Tool 类型 → 期望连接器类型（前端绑定提示） */
export const TOOL_TYPE_CONNECTOR_TYPE: Record<ToolType, string | null> = {
  query: 'db_readonly',
  action: 'http',
  notification: 'notification',
  workflow: null,
};
