import { apiFetch, resolveApiOrigin, ApiError } from './api';

const PROXY_BASE = '/api/v1/knowledge';

export const KNOWLEDGE_PROXY_ERROR_CODES = [
  'KNOWLEDGE_PROXY_UNAVAILABLE',
  'KNOWLEDGE_PROXY_UPSTREAM',
  'KNOWLEDGE_PROXY_TIMEOUT',
] as const;

export type KnowledgeLayer = 'raw' | 'wiki' | 'schema' | 'media';
export const TEXT_LAYERS: KnowledgeLayer[] = ['raw', 'wiki', 'schema'];
export const ALL_LAYERS: KnowledgeLayer[] = ['raw', 'wiki', 'schema', 'media'];

export const LAYER_LABELS: Record<KnowledgeLayer, string> = {
  raw: '原始素材 (raw)',
  wiki: '编译条目 (wiki)',
  schema: '规范结构 (schema)',
  media: '媒体资源 (media)',
};

// ── 类型 ────────────────────────────────────────────────────

export interface LayerEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  embedding_status?: 'embedded' | 'stale' | 'not_embedded';
}

export interface ListLayerResponse {
  layer: string;
  prefix: string;
  entries: LayerEntry[];
}

export interface FileContentResponse {
  layer: string;
  path: string;
  content: string;
  size: number;
}

export interface DataFolderTreeNode {
  path: string;
  title: string;
  children: DataFolderTreeNode[];
}

export interface DialogueRecallHit {
  path: string;
  score: number;
  snippet: string;
  heading_path?: string;
}

export interface MediaRef {
  code: string;
  mime: string;
  title?: string | null;
  size: number;
}

export interface DialogueRecallResponse {
  user_query: string;
  recall_method: string;
  query_terms?: string[];
  files_scanned?: number;
  recall_hits: DialogueRecallHit[];
  merged_media?: MediaRef[];
  bm25?: DialogueRecallLaneStatus;
  vector?: DialogueRecallLaneStatus;
  injected_context?: string;
  context_truncated?: boolean;
  message?: string;
}

export interface PolishTextResponse {
  content: string;
  model: string;
}

export interface MediaBackrefEntry {
  wiki_path: string;
  heading_path: string;
}

export interface MediaBackrefsResponse {
  code: string;
  entries: MediaBackrefEntry[];
  message: string;
}

export interface MediaImportZipRow {
  source_code: string;
  result_code: string;
  status: string;
  detail: string;
}

export interface MediaImportZipResponse {
  results: MediaImportZipRow[];
  message: string;
  warning?: string;
}

export interface MediaDeleteBatchRow {
  code: string;
  status: string;
  detail: string;
}

export interface MediaDeleteBatchResponse {
  results: MediaDeleteBatchRow[];
  message: string;
}

export interface MediaDeleteOneResponse {
  code: string;
  deleted: boolean;
  message: string;
}

export interface DialogueRecallLaneStatus {
  status: string;
  candidate_count: number;
  detail?: string | null;
  embedding_model?: string | null;
}

export interface TaskUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface DialogueRecallTestResponse {
  user_query: string;
  recall_method: string;
  query_terms?: string[];
  files_scanned?: number;
  recall_hits: DialogueRecallHit[];
  merged_media?: MediaRef[];
  bm25?: DialogueRecallLaneStatus;
  vector?: DialogueRecallLaneStatus;
  injected_context?: string;
  context_truncated?: boolean;
  assistant_reply?: string;
  model?: string;
  usage?: TaskUsage;
  message?: string;
  /** 平台 QA 预览 */
  prompt_version?: number;
  prompt_key?: string;
  prompt_channel?: string;
  elapsed_ms?: number;
}

export interface MediaResolvedItem {
  code: string;
  registered: boolean;
  mime: string;
  size: number;
  title?: string | null;
  original_name?: string | null;
  created_at?: string;
  sha256?: string;
}

export interface MediaResolveFromTextResponse {
  codes: string[];
  items: MediaResolvedItem[];
}

export interface MediaItem {
  code: string;
  title?: string | null;
  mime?: string;
  size?: number;
  sha256?: string;
  created_at?: string;
  original_name?: string | null;
  /** wiki manifest：media/ 下子目录 */
  folder?: string;
  /** 兼容旧字段 */
  target_folder?: string;
}

/** 归一化 wiki 媒体列表项（folder / target_folder） */
export function normalizeMediaItem(item: MediaItem): MediaItem {
  const folder = item.folder ?? item.target_folder ?? '';
  return { ...item, folder };
}

export interface MediaListResponse {
  items: MediaItem[];
  count: number;
  bytes_total: number;
}

export interface MediaSummary {
  count: number;
  bytes_registered: number;
}

export interface ProxyHealth {
  status: string;
  service?: string;
}

// ── 错误辅助 ────────────────────────────────────────────────

export function isKnowledgeProxyError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    (KNOWLEDGE_PROXY_ERROR_CODES as readonly string[]).includes(err.code)
  );
}

export function knowledgeProxyErrorMessage(err: unknown): string {
  if (isKnowledgeProxyError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return '知识库代理请求失败';
}

// ── 内部 fetch ──────────────────────────────────────────────

const TOKEN_KEY = 'shellder.accessToken';
const TENANT_KEY = 'shellder.activeTenantId';

function authHeaders(json = true): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = window.localStorage.getItem(TENANT_KEY);
  if (tenantId) headers['x-active-tenant-id'] = tenantId;
  return headers;
}

function buildProxyUrl(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): string {
  const url = new URL(path.replace(/^\//, ''), `${resolveApiOrigin()}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    }
    throw new ApiError(res.status, (data ?? {}) as Partial<import('./api').ApiErrorBody>);
  }
  return data as T;
}

async function proxyFetch<T>(
  subPath: string,
  tenantId: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined | null>;
  } = {},
): Promise<T> {
  const { method = 'GET', body, query } = options;
  const res = await fetch(buildProxyUrl(`${PROXY_BASE}${subPath}`, { tenantId, ...query }), {
    method,
    headers: authHeaders(!!body),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  return parseResponse<T>(res);
}

async function proxyUpload<T>(
  subPath: string,
  tenantId: string,
  form: FormData,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const res = await fetch(buildProxyUrl(`${PROXY_BASE}${subPath}`, { tenantId, ...query }), {
    method: 'POST',
    headers: authHeaders(false),
    body: form,
    cache: 'no-store',
  });
  return parseResponse<T>(res);
}

async function proxyFetchBlob(
  subPath: string,
  tenantId: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ blob: Blob; contentDisposition?: string }> {
  const { method = 'POST', body } = options;
  const res = await fetch(buildProxyUrl(`${PROXY_BASE}${subPath}`, { tenantId }), {
    method,
    headers: authHeaders(!!body),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    let data: Partial<import('./api').ApiErrorBody> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, data);
  }
  const cd = res.headers.get('content-disposition') ?? undefined;
  return { blob: await res.blob(), contentDisposition: cd };
}

// ── 健康检查 ────────────────────────────────────────────────

export interface KnowledgeConnectionSettings {
  wikiBaseUrl: string;
  wikiTimeoutMs: number;
  configured: boolean;
}

export function getKnowledgeConnection() {
  return apiFetch<KnowledgeConnectionSettings>(`${PROXY_BASE}/connection`);
}

export function upsertKnowledgeConnection(body: {
  wikiBaseUrl: string;
  wikiTimeoutMs?: number;
}) {
  return apiFetch<KnowledgeConnectionSettings>(`${PROXY_BASE}/connection`, {
    method: 'PUT',
    body,
  });
}

export async function checkKnowledgeProxyHealth(): Promise<ProxyHealth> {
  const res = await fetch(buildProxyUrl(`${PROXY_BASE}/health`), {
    headers: authHeaders(false),
    cache: 'no-store',
  });
  return parseResponse<ProxyHealth>(res);
}

// ── layers ──────────────────────────────────────────────────

export function listLayerEntries(tenantId: string, layer: string, prefix?: string) {
  return proxyFetch<ListLayerResponse>(`/layers/${layer}/entries`, tenantId, {
    query: { prefix: prefix ?? '' },
  });
}

export function readLayerFile(tenantId: string, layer: string, path: string) {
  return proxyFetch<FileContentResponse>(`/layers/${layer}/file`, tenantId, {
    query: { path },
  });
}

export function writeLayerFile(tenantId: string, layer: string, path: string, content: string) {
  return proxyFetch<FileContentResponse>(`/layers/${layer}/file`, tenantId, {
    method: 'PUT',
    query: { path },
    body: { content },
  });
}

export function deleteLayerFile(tenantId: string, layer: string, path: string) {
  return proxyFetch<{ ok: boolean; deleted: string }>(`/layers/${layer}/file`, tenantId, {
    method: 'DELETE',
    query: { path },
  });
}

export function uploadLayerFile(tenantId: string, layer: string, file: File, path?: string) {
  const form = new FormData();
  form.append('file', file);
  return proxyUpload<FileContentResponse>(
    `/layers/${layer}/upload`,
    tenantId,
    form,
    path ? { path } : undefined,
  );
}

export interface WikiEmbedResponse {
  path?: string;
  chunk_count?: number;
  model?: string;
  updated_at?: string;
  message?: string;
}

export interface RawLayerEmbedResponse {
  compile?: { output_path?: string; message?: string };
  embed?: WikiEmbedResponse;
}

export function triggerLayerEmbed(tenantId: string, layer: string, path: string) {
  return proxyFetch<WikiEmbedResponse | RawLayerEmbedResponse>(`/layers/${layer}/embed`, tenantId, {
    method: 'POST',
    query: { path },
  });
}

// ── data-structure ──────────────────────────────────────────

export function getDataTree(
  tenantId: string,
  layer: string,
  opts?: { max_depth?: number; max_nodes?: number },
) {
  return proxyFetch<DataFolderTreeNode>(`/data-structure/tree/${layer}`, tenantId, {
    query: opts,
  });
}

export function createFolder(tenantId: string, layer: string, name: string) {
  return proxyFetch<{ ok: boolean }>('/data-structure/folders', tenantId, {
    method: 'POST',
    body: { layer, name },
  });
}

export function renameFolder(tenantId: string, layer: string, path: string, newName: string) {
  return proxyFetch<{ ok: boolean }>('/data-structure/folders/rename', tenantId, {
    method: 'PATCH',
    body: { layer, path, new_name: newName },
  });
}

export function deleteFolder(tenantId: string, layer: string, path: string) {
  return proxyFetch<{ ok: boolean }>('/data-structure/folders', tenantId, {
    method: 'DELETE',
    query: { layer, path },
  });
}

// ── dialogue ────────────────────────────────────────────────

export function dialogueRecall(
  tenantId: string,
  body: {
    query: string;
    wiki_prefix?: string;
    max_files?: number;
    bm25_top_n?: number;
    vector_top_n?: number;
    top_k_chunks?: number;
    chunk_max_chars?: number;
    context_budget_chars?: number;
  },
) {
  return proxyFetch<DialogueRecallResponse>('/dialogue/recall', tenantId, {
    method: 'POST',
    body,
  });
}

export function dialogueRecallTest(
  tenantId: string,
  body: {
    query: string;
    wiki_prefix?: string;
    max_files?: number;
    bm25_top_n?: number;
    vector_top_n?: number;
    top_k_chunks?: number;
    chunk_max_chars?: number;
    context_budget_chars?: number;
    system_prompt?: string;
  },
) {
  return proxyFetch<DialogueRecallTestResponse>('/dialogue/recall-test', tenantId, {
    method: 'POST',
    body,
  });
}

export function resolveMediaFromText(
  tenantId: string,
  body: { text?: string; codes?: string[] },
) {
  return proxyFetch<MediaResolveFromTextResponse>('/media/resolve-from-text', tenantId, {
    method: 'POST',
    body,
  });
}

/** 与 Runtime 一致：wiki recall + 平台 LLM（system 来自 published qa.dialogue.system） */
export function dialogueQaPreview(
  tenantId: string,
  body: {
    query: string;
    wiki_prefix?: string;
    top_k_chunks?: number;
    bm25_top_n?: number;
    vector_top_n?: number;
  },
  options?: { channel?: 'published' | 'draft'; promptKey?: string },
) {
  const q = new URLSearchParams();
  if (options?.channel) q.set('channel', options.channel);
  if (options?.promptKey) q.set('prompt_key', options.promptKey);
  const qs = q.toString();
  return proxyFetch<DialogueRecallTestResponse>(
    `/dialogue/qa-preview${qs ? `?${qs}` : ''}`,
    tenantId,
    { method: 'POST', body },
  );
}

// ── media ───────────────────────────────────────────────────

export function listMediaItems(tenantId: string) {
  return proxyFetch<MediaListResponse>('/media/items', tenantId).then((res) => ({
    ...res,
    items: (res.items ?? []).map(normalizeMediaItem),
  }));
}

export function getMediaSummary(tenantId: string) {
  return proxyFetch<MediaSummary>('/media/meta/summary', tenantId);
}

export function uploadMedia(tenantId: string, file: File, title?: string, targetFolder?: string) {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  if (targetFolder) form.append('target_folder', targetFolder);
  return proxyUpload<{ code: string; deduplicated?: boolean; message?: string }>(
    '/media/upload',
    tenantId,
    form,
  );
}

export function deleteMedia(tenantId: string, code: string) {
  return proxyFetch<MediaDeleteOneResponse>(`/media/${encodeURIComponent(code)}`, tenantId, {
    method: 'DELETE',
  });
}

export function getMediaBackrefs(tenantId: string, code: string) {
  return proxyFetch<MediaBackrefsResponse>(
    `/media/${encodeURIComponent(code)}/backrefs`,
    tenantId,
  );
}

export function batchDeleteMedia(tenantId: string, codes: string[]) {
  return proxyFetch<MediaDeleteBatchResponse>('/media/batch-delete', tenantId, {
    method: 'POST',
    body: { codes },
  });
}

export function exportMediaZip(tenantId: string, codes: string[]) {
  return proxyFetchBlob('/media/export-zip', tenantId, { body: { codes } });
}

export function importMediaZip(
  tenantId: string,
  file: File,
  targetFolder?: string,
) {
  const form = new FormData();
  form.append('file', file);
  if (targetFolder) form.append('target_folder', targetFolder);
  return proxyUpload<MediaImportZipResponse>('/media/import-zip', tenantId, form);
}

export function polishText(
  tenantId: string,
  body: { content: string; instruction?: string },
) {
  return proxyFetch<PolishTextResponse>('/tasks/polish-text', tenantId, {
    method: 'POST',
    body,
  });
}

export function reindexMediaBackrefs(tenantId: string) {
  return proxyFetch<{ codes_with_refs: number; total_ref_rows: number; message?: string }>(
    '/media/reindex-backrefs',
    tenantId,
    { method: 'POST', body: {} },
  );
}

export function getMediaDownloadUrl(tenantId: string, code: string): string {
  return buildProxyUrl(`${PROXY_BASE}/media/${encodeURIComponent(code)}`, { tenantId });
}

/** 媒体二进制 URL（经平台 knowledge 代理，含租户；img 标签无法带 Bearer，预览请用 fetchMediaObjectUrl） */
export function getMediaBinaryUrl(tenantId: string, code: string): string {
  return getMediaDownloadUrl(tenantId, code);
}

/** 带认证的媒体 object URL（调用方应在不用时 revoke） */
export async function fetchMediaObjectUrl(tenantId: string, code: string): Promise<string> {
  const res = await fetch(getMediaDownloadUrl(tenantId, code), {
    headers: authHeaders(false),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    let data: Partial<import('./api').ApiErrorBody> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, data);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function openMediaInNewTab(tenantId: string, code: string): Promise<void> {
  const url = await fetchMediaObjectUrl(tenantId, code);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
