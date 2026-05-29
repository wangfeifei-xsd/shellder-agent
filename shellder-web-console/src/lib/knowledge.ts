import { apiFetch } from './api';

// ── 类型定义 ────────────────────────────────────────────────

export type KbStatus = 'active' | 'disabled' | 'deleted';
export type KbDocumentStatus = 'pending' | 'chunking' | 'embedding' | 'ready' | 'error';
export type KbDataSourceType = 'file' | 'url' | 'api' | 'connector';
export type KbEmbeddingTaskStatus = 'queued' | 'running' | 'done' | 'failed';
export type ChunkStrategy = 'fixed_size' | 'paragraph' | 'sentence';
export type SimilarityMetric = 'cosine' | 'euclidean' | 'dot_product';

export interface KnowledgeBase {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  embeddingModel: string;
  similarityMetric: SimilarityMetric;
  chunkStrategy: ChunkStrategy;
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

export interface KnowledgeBaseDetail extends KnowledgeBase {
  dataSourceCount: number;
  recentEmbeddingTasks: KbEmbeddingTask[];
}

export interface KbDataSource {
  id: string;
  knowledgeBaseId: string;
  tenantId: string;
  name: string;
  type: KbDataSourceType;
  config: Record<string, unknown> | null;
  syncCron: string | null;
  lastSyncAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbDocument {
  id: string;
  dataSourceId: string | null;
  knowledgeBaseId: string;
  tenantId: string;
  title: string;
  fileKey: string | null;
  fileSize: number | null;
  mimeType: string | null;
  contentHash: string | null;
  charCount: number;
  chunkCount: number;
  status: KbDocumentStatus;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbEmbeddingTask {
  id: string;
  knowledgeBaseId: string;
  tenantId: string;
  documentId: string | null;
  status: KbEmbeddingTaskStatus;
  totalChunks: number;
  processedChunks: number;
  errorMsg: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  document?: { id: string; title: string; status?: string } | null;
}

export interface RetrieveResult {
  query: string;
  topK: number;
  threshold: number;
  results: {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    content: string;
    chunkIndex: number;
    tokenCount: number;
    score: number;
    metadata: Record<string, unknown> | null;
  }[];
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
  embeddingModel?: string;
  similarityMetric?: SimilarityMetric;
  chunkStrategy?: ChunkStrategy;
  chunkSize?: number;
  chunkOverlap?: number;
}

export type UpdateKbInput = Partial<Omit<CreateKbInput, 'tenantId'>> & { status?: 'active' | 'disabled' };

// ── API 调用 ────────────────────────────────────────────────

type QP = Record<string, string | number | undefined | null>;
const BASE = '/api/v1/knowledge-bases';

export function listKnowledgeBases(
  query: { tenantId?: string; status?: string; keyword?: string; page?: number; pageSize?: number } = {},
) {
  return apiFetch<PagedResult<KnowledgeBase>>(BASE, { query: query as QP });
}

export function getKnowledgeBase(id: string) {
  return apiFetch<KnowledgeBaseDetail>(`${BASE}/${id}`);
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

// ── 数据源 ──────────────────────────────────────────────────

export function listDataSources(kbId: string) {
  return apiFetch<KbDataSource[]>(`${BASE}/${kbId}/data-sources`);
}

export function addDataSource(
  kbId: string,
  input: { name: string; type: KbDataSourceType; config?: Record<string, unknown>; syncCron?: string },
) {
  return apiFetch<KbDataSource>(`${BASE}/${kbId}/data-sources`, { method: 'POST', body: input });
}

export function removeDataSource(kbId: string, dsId: string) {
  return apiFetch<{ id: string }>(`${BASE}/${kbId}/data-sources/${dsId}`, { method: 'DELETE' });
}

// ── 文档 ────────────────────────────────────────────────────

export function listDocuments(
  kbId: string,
  query: { status?: string; keyword?: string; page?: number; pageSize?: number } = {},
) {
  return apiFetch<PagedResult<KbDocument>>(`${BASE}/${kbId}/documents`, { query: query as QP });
}

export function uploadDocument(
  kbId: string,
  input: { title: string; content: string; fileKey?: string; fileSize?: number; mimeType?: string },
) {
  return apiFetch<KbDocument>(`${BASE}/${kbId}/documents/upload`, { method: 'POST', body: input });
}

export function deleteDocument(kbId: string, docId: string) {
  return apiFetch<{ id: string }>(`${BASE}/${kbId}/documents/${docId}`, { method: 'DELETE' });
}

// ── 检索 ────────────────────────────────────────────────────

export function retrieveKnowledge(
  kbId: string,
  input: { query: string; topK?: number; threshold?: number },
) {
  return apiFetch<RetrieveResult>(`${BASE}/${kbId}/retrieve`, { method: 'POST', body: input });
}

// ── 向量化任务 ──────────────────────────────────────────────

export function listEmbeddingTasks(
  kbId: string,
  query: { status?: string; page?: number; pageSize?: number } = {},
) {
  return apiFetch<PagedResult<KbEmbeddingTask>>(`${BASE}/${kbId}/embedding-tasks`, { query: query as QP });
}

export function getEmbeddingTask(kbId: string, taskId: string) {
  return apiFetch<KbEmbeddingTask>(`${BASE}/${kbId}/embedding-tasks/${taskId}`);
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

export const DOC_STATUS_META: Record<KbDocumentStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'default' },
  chunking: { label: '分块中', color: 'processing' },
  embedding: { label: '向量化中', color: 'processing' },
  ready: { label: '就绪', color: 'green' },
  error: { label: '失败', color: 'red' },
};

export const DOC_STATUS_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'chunking', label: '分块中' },
  { value: 'embedding', label: '向量化中' },
  { value: 'ready', label: '就绪' },
  { value: 'error', label: '失败' },
];

export const DS_TYPE_META: Record<KbDataSourceType, { label: string; color: string }> = {
  file: { label: '文件', color: 'blue' },
  url: { label: 'URL', color: 'cyan' },
  api: { label: 'API', color: 'purple' },
  connector: { label: '连接器', color: 'geekblue' },
};

export const DS_TYPE_OPTIONS = [
  { value: 'file', label: '文件' },
  { value: 'url', label: 'URL' },
  { value: 'api', label: 'API' },
  { value: 'connector', label: '连接器' },
];

export const TASK_STATUS_META: Record<KbEmbeddingTaskStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  done: { label: '完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

export const CHUNK_STRATEGY_META: Record<ChunkStrategy, { label: string }> = {
  fixed_size: { label: '固定大小' },
  paragraph: { label: '按段落' },
  sentence: { label: '按句子' },
};

export const CHUNK_STRATEGY_OPTIONS = [
  { value: 'fixed_size', label: '固定大小' },
  { value: 'paragraph', label: '按段落' },
  { value: 'sentence', label: '按句子' },
];

export const SIMILARITY_METRIC_OPTIONS = [
  { value: 'cosine', label: '余弦相似度' },
  { value: 'euclidean', label: '欧氏距离' },
  { value: 'dot_product', label: '点积' },
];
