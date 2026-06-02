import { apiFetch } from './api';

export type PromptCategory = 'qa' | 'query' | 'sql_conversion' | 'connector' | 'routing' | 'runtime' | 'common';
export type PromptRole = 'system' | 'user' | 'fragment';
export type PromptScope = 'global' | 'tenant';
export type PromptTemplateStatus = 'active' | 'archived';
export type PromptVersionState = 'draft' | 'published' | 'deprecated';
export type PromptBindType = 'capability' | 'skill' | 'tool' | 'connector' | 'default';

export interface PromptTemplateListItem {
  id: string;
  promptKey: string;
  name: string;
  category: PromptCategory;
  role: PromptRole;
  scope: PromptScope;
  tenantId: string | null;
  status: PromptTemplateStatus;
  publishedVersion: number | null;
  publishedVersionId: string | null;
  updatedAt: string;
}

export interface PromptTemplateDetail {
  id: string;
  promptKey: string;
  name: string;
  description: string | null;
  category: PromptCategory;
  role: PromptRole;
  scope: PromptScope;
  tenantId: string | null;
  variableSchema: Record<string, unknown> | null;
  status: PromptTemplateStatus;
  createdAt: string;
  updatedAt: string;
  publishedVersion: { id: string; version: number; publishedAt: string | null } | null;
  draftVersion: { id: string; version: number } | null;
}

export interface PromptVersionItem {
  id: string;
  version: number;
  state: PromptVersionState;
  content?: string;
  changelog: string | null;
  contentHash: string;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
}

export interface PromptBinding {
  id: string;
  tenantId: string | null;
  bindType: PromptBindType;
  bindId: string | null;
  promptKey: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedPromptTemplates {
  total: number;
  page: number;
  pageSize: number;
  items: PromptTemplateListItem[];
}

export interface RenderPromptResult {
  content: string;
  templateId: string;
  versionId: string;
  version: number;
}

export function listPromptTemplates(params?: {
  page?: number;
  pageSize?: number;
  category?: PromptCategory;
  role?: PromptRole;
  keyword?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.category) q.set('category', params.category);
  if (params?.role) q.set('role', params.role);
  if (params?.keyword) q.set('keyword', params.keyword);
  const qs = q.toString();
  return apiFetch<PaginatedPromptTemplates>(`/api/v1/prompts/templates${qs ? `?${qs}` : ''}`);
}

export function getPromptTemplate(id: string) {
  return apiFetch<PromptTemplateDetail>(`/api/v1/prompts/templates/${id}`);
}

export function listPromptVersions(templateId: string) {
  return apiFetch<{ templateId: string; items: PromptVersionItem[] }>(
    `/api/v1/prompts/templates/${templateId}/versions`,
  );
}

export function createPromptDraft(templateId: string) {
  return apiFetch<PromptVersionItem>(`/api/v1/prompts/templates/${templateId}/versions`, {
    method: 'POST',
  });
}

export function updatePromptVersion(versionId: string, body: { content?: string; changelog?: string }) {
  return apiFetch<PromptVersionItem>(`/api/v1/prompts/versions/${versionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function publishPromptVersion(versionId: string) {
  return apiFetch<PromptVersionItem>(`/api/v1/prompts/versions/${versionId}/publish`, {
    method: 'POST',
  });
}

export function rollbackPromptVersion(versionId: string) {
  return apiFetch<PromptVersionItem>(`/api/v1/prompts/versions/${versionId}/rollback`, {
    method: 'POST',
  });
}

export function renderPrompt(body: {
  promptKey: string;
  tenantId?: string;
  channel?: 'published' | 'draft';
  variables?: Record<string, unknown>;
}) {
  return apiFetch<RenderPromptResult>('/api/v1/prompts/render', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function renderPromptTestLlm(body: {
  promptKey: string;
  tenantId?: string;
  channel?: 'published' | 'draft';
  variables?: Record<string, unknown>;
  userMessage?: string;
}) {
  return apiFetch<{
    render: RenderPromptResult;
    llm: { text: string; model: string; elapsedMs: number };
  }>('/api/v1/prompts/render/test-llm', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listPromptBindings(params?: {
  tenantId?: string;
  bindType?: PromptBindType;
  promptKey?: string;
}) {
  const q = new URLSearchParams();
  if (params?.tenantId) q.set('tenantId', params.tenantId);
  if (params?.bindType) q.set('bindType', params.bindType);
  if (params?.promptKey) q.set('promptKey', params.promptKey);
  const qs = q.toString();
  return apiFetch<{ items: PromptBinding[] }>(`/api/v1/prompts/bindings${qs ? `?${qs}` : ''}`);
}

export function createPromptBinding(body: {
  tenantId?: string;
  bindType: PromptBindType;
  bindId?: string;
  promptKey: string;
  priority?: number;
}) {
  return apiFetch<PromptBinding>('/api/v1/prompts/bindings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deletePromptBinding(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/v1/prompts/bindings/${id}`, { method: 'DELETE' });
}
