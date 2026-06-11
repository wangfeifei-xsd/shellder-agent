import { apiFetch } from './api';

export type ConnectorType = 'db_readonly' | 'http' | 'notification';
export type ConnectorStatus = 'enabled' | 'disabled';
export type ConnectorTestStatus = 'success' | 'failed';
export type AuthType = 'none' | 'basic' | 'bearer' | 'api_key' | 'custom';

export interface ConnectorCredentialHints {
  username: string | null;
  passwordConfigured: boolean;
}

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
  credentialHints?: ConnectorCredentialHints | null;
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

export interface ConnectorSqlTestResult {
  executed: boolean;
  status: 'success' | 'failed';
  rawRequest?: unknown;
  rawResponse?: unknown;
  transformedResult?: unknown;
  durationMs: number;
  message: string;
}

/** 只读库连接器 SQL 查询测试（『查询型』配置 → 查询测试） */
export function sqlTestConnector(
  id: string,
  input: { sql: string; params?: Record<string, unknown> },
) {
  return apiFetch<ConnectorSqlTestResult>(`${BASE}/${id}/sql-test`, {
    method: 'POST',
    body: input,
  });
}

// ── 只读库结构 / ER 图 ────────────────────────────────────

export interface IntrospectedColumn {
  name: string;
  dataType: string;
  columnType: string;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
  ordinalPosition: number;
}

export interface IntrospectedForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface IntrospectedIndex {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface IntrospectedTable {
  name: string;
  comment: string | null;
  columns: IntrospectedColumn[];
  primaryKey: string[];
  foreignKeys: IntrospectedForeignKey[];
  indexes: IntrospectedIndex[];
}

export interface IntrospectedSchema {
  database: string;
  tables: IntrospectedTable[];
  extractedAt: string;
}

export interface ErColumn {
  name: string;
  type: string;
  pk?: boolean;
  fk?: { table: string; column: string };
}

export interface ErDataScopeBinding {
  scopeColumn?: string;
  userColumn?: string;
  /** 已加入范围列维护列表（可与 user 维度独立） */
  scopeConfigured?: boolean;
  /** 已加入用户列维护列表 */
  userConfigured?: boolean;
  /** 范围列映射已人工确认（LLM 推断后点确认） */
  scopeConfirmed?: boolean;
  /** 用户列映射已人工确认 */
  userConfirmed?: boolean;
  inferred?: boolean;
  reason?: string;
}

export interface ErTableNode {
  name: string;
  displayName?: string;
  columns: ErColumn[];
  dataScope?: ErDataScopeBinding;
}

export interface ErRelationship {
  id: string;
  from: string;
  to: string;
  fromColumns: string[];
  toColumns: string[];
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:M';
  inferred: boolean;
}

export interface ErDiagram {
  version?: number;
  tables: ErTableNode[];
  relationships: ErRelationship[];
}

export interface ErDiagramState {
  introspectedAt: string | null;
  draft: ErDiagram | null;
  published: ErDiagram | null;
  publishedVersion: number | null;
  publishedAt: string | null;
}

export function introspectConnector(id: string) {
  return apiFetch<{ schema: IntrospectedSchema }>(`${BASE}/${id}/introspect`, {
    method: 'POST',
  });
}

export function getConnectorSchema(id: string) {
  return apiFetch<{
    introspectedSchema: IntrospectedSchema | null;
    introspectedAt: string | null;
  }>(`${BASE}/${id}/schema`);
}

export function getConnectorErDiagram(id: string) {
  return apiFetch<ErDiagramState>(`${BASE}/${id}/er-diagram`);
}

export function saveConnectorErDraft(id: string, diagram: ErDiagram) {
  return apiFetch<{ draft: ErDiagram }>(`${BASE}/${id}/er-diagram/draft`, {
    method: 'PUT',
    body: { diagram },
  });
}

export function publishConnectorErDiagram(id: string) {
  return apiFetch<{ published: ErDiagram; version: number; publishedAt: string }>(
    `${BASE}/${id}/er-diagram/publish`,
    { method: 'POST' },
  );
}

export interface ErGenerationJobView {
  status: 'idle' | 'running' | 'done' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

/** 异步触发 LLM 生成 ER 草稿，立即返回任务状态；结果通过 getErGenerationStatus 轮询 */
export function regenerateConnectorErDraft(id: string) {
  return apiFetch<ErGenerationJobView>(`${BASE}/${id}/er-diagram/regenerate`, {
    method: 'POST',
  });
}

export function getErGenerationStatus(id: string) {
  return apiFetch<ErGenerationJobView>(
    `${BASE}/${id}/er-diagram/generation-status`,
  );
}

export function suggestConnectorErDataScope(id: string) {
  return apiFetch<{ draft: ErDiagram; warnings?: string[] }>(
    `${BASE}/${id}/er-diagram/suggest-data-scope`,
    {
      method: 'POST',
    },
  );
}

/** db_readonly 展示：host:port / database */
export function formatDbTarget(
  c: Connector | { target: string; database?: string | null; properties?: Record<string, unknown> },
): string {
  let db: string | null | undefined;
  if ('database' in c && c.database != null) {
    db = String(c.database);
  } else if ('properties' in c && c.properties?.database != null) {
    db = String(c.properties.database);
  }
  if (!db) return c.target;
  return `${c.target} / ${db}`;
}

export interface DbSchemaConnectorSummary {
  id: string;
  tenantId: string;
  name: string;
  target: string;
  database: string | null;
  status: ConnectorStatus;
  introspectedAt: string | null;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishedTableCount: number;
  hasPublished: boolean;
}

export function listDbSchemaConnectors(tenantId?: string) {
  return apiFetch<{ items: DbSchemaConnectorSummary[] }>(`${BASE}/db-schema`, {
    query: tenantId ? { tenantId } : undefined,
  });
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

/** 连接器列表（HTTP / 通知） */
export const GENERAL_CONNECTOR_TYPE_OPTIONS = CONNECTOR_TYPE_OPTIONS.filter(
  (o) => o.value !== 'db_readonly',
);

/** 数据库连接器（查询型） */
export const DB_CONNECTOR_TYPE_OPTIONS = CONNECTOR_TYPE_OPTIONS.filter(
  (o) => o.value === 'db_readonly',
);

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

/** 只读数据库连接器仅允许 Basic */
export const DB_READONLY_AUTH_TYPE_OPTIONS = AUTH_TYPE_OPTIONS.filter(
  (o) => o.value === 'basic',
);

export const TEST_STATUS_META: Record<ConnectorTestStatus, { label: string; color: string }> = {
  success: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' },
};
