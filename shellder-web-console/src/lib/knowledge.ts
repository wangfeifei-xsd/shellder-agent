import { apiFetch } from './api';

// ── 类型定义 ────────────────────────────────────────────────

export type KbStatus = 'active' | 'disabled' | 'deleted';

export interface KnowledgeBase {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  pathyWikiPrefix: string | null;
  embeddingModel: string;
  similarityMetric: string;
  chunkStrategy: string;
  chunkSize: number;
  chunkOverlap: number;
  status: KbStatus;
  documentCount: number;
  chunkCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateKbInput {
  tenantId: string;
  name: string;
  description?: string;
  pathyWikiPrefix?: string;
}

export type UpdateKbInput = Partial<Omit<CreateKbInput, 'tenantId'>> & {
  status?: 'active' | 'disabled';
};

// ── API 调用 ────────────────────────────────────────────────

type QP = Record<string, string | number | undefined | null>;
const BASE = '/api/v1/knowledge-bases';

export function listKnowledgeBases(
  query: { tenantId?: string; status?: string; keyword?: string; page?: number; pageSize?: number } = {},
) {
  return apiFetch<PagedResult<KnowledgeBase>>(BASE, { query: query as QP });
}

export function getKnowledgeBase(id: string) {
  return apiFetch<KnowledgeBase>(`${BASE}/${id}`);
}

export function createKnowledgeBase(input: CreateKbInput) {
  return apiFetch<KnowledgeBase>(BASE, { method: 'POST', body: input });
}

export function updateKnowledgeBase(id: string, input: UpdateKbInput) {
  return apiFetch<KnowledgeBase>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function deleteKnowledgeBase(id: string) {
  return apiFetch<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}

// ── 展示元数据 ──────────────────────────────────────────────

export const KB_STATUS_META: Record<KbStatus, { label: string; color: string }> = {
  active: { label: '正常', color: 'green' },
  disabled: { label: '已禁用', color: 'default' },
  deleted: { label: '已删除', color: 'red' },
};

export const KB_STATUS_OPTIONS = [
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '已禁用' },
];
