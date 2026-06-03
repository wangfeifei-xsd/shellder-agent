import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { KnowledgeProxyClient } from './knowledge-proxy.client';
import { pickQueryInts } from './knowledge-proxy-query.util';
import { KnowledgeTenantScopeService } from './knowledge-tenant-scope.service';

export interface DialogueRecallHit {
  path: string;
  score: number;
  snippet: string;
  heading_path?: string;
}

export interface DialogueRecallLaneStatus {
  status: string;
  candidate_count: number;
  detail?: string | null;
  embedding_model?: string | null;
}

export interface RecallMediaRef {
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
  merged_media?: RecallMediaRef[];
  bm25?: DialogueRecallLaneStatus;
  vector?: DialogueRecallLaneStatus;
  injected_context?: string;
  context_truncated?: boolean;
  assistant_reply?: string;
  message?: string;
}

@Injectable()
export class KnowledgeProxyService {
  constructor(
    private readonly client: KnowledgeProxyClient,
    private readonly tenantScope: KnowledgeTenantScopeService,
    private readonly permissionService: PermissionService,
  ) {}

  async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的知识库访问权限',
      });
    }
  }

  async health() {
    return this.client.request<{ status: string; service: string }>({
      method: 'GET',
      path: '/health',
      responseType: 'json',
      timeoutMs: 5_000,
    });
  }

  async getConfig(user: AuthUser, tenantId: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({ method: 'GET', path: '/api/v1/config' });
  }

  // ── layers ─────────────────────────────────────────────────

  async listLayerEntries(
    user: AuthUser,
    tenantId: string,
    layer: string,
    prefix?: string,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'GET',
      path: `/api/v1/layers/${layer}/entries`,
      query: { prefix: this.tenantScope.scopeLayerPrefix(wikiPrefix, prefix ?? '') },
    });
  }

  async listLayerFiles(
    user: AuthUser,
    tenantId: string,
    layer: string,
    query: { suffix?: string; max_files?: number },
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    const fileQuery: Record<string, string | number> = {};
    if (query.suffix) fileQuery.suffix = query.suffix;
    const intQuery = pickQueryInts({ max_files: query.max_files });
    const result = await this.client.request<{
      layer: string;
      paths: string[];
      truncated: boolean;
    }>({
      method: 'GET',
      path: `/api/v1/layers/${layer}/files`,
      query: { ...fileQuery, ...intQuery },
    });
    const prefix = wikiPrefix ? this.tenantScope.normalizePrefix(wikiPrefix) : '';
    if (prefix && result.paths) {
      result.paths = result.paths
        .filter((p) => p.startsWith(prefix))
        .map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p));
    }
    return result;
  }

  async readLayerFile(
    user: AuthUser,
    tenantId: string,
    layer: string,
    path: string,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'GET',
      path: `/api/v1/layers/${layer}/file`,
      query: { path: this.tenantScope.scopeLayerPath(wikiPrefix, path) },
    });
  }

  async writeLayerFile(
    user: AuthUser,
    tenantId: string,
    layer: string,
    path: string,
    content: string,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'PUT',
      path: `/api/v1/layers/${layer}/file`,
      query: { path: this.tenantScope.scopeLayerPath(wikiPrefix, path) },
      body: { content },
    });
  }

  async deleteLayerFile(
    user: AuthUser,
    tenantId: string,
    layer: string,
    path: string,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'DELETE',
      path: `/api/v1/layers/${layer}/file`,
      query: { path: this.tenantScope.scopeLayerPath(wikiPrefix, path) },
    });
  }

  async uploadLayerFile(
    user: AuthUser,
    tenantId: string,
    layer: string,
    form: FormData,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    const pathField = form.get('path');
    if (typeof pathField === 'string' && pathField) {
      form.set('path', this.tenantScope.scopeLayerPath(wikiPrefix, pathField));
    }
    return this.client.request({
      method: 'POST',
      path: `/api/v1/layers/${layer}/upload`,
      body: form,
    });
  }

  /**
   * 同步调用 wiki 服务：wiki 嵌入；raw 先 compile 再嵌入（与 wiki 知识库控制台一致）。
   * 不经过平台 kb_layer_processing_job / job-worker 队列表。
   */
  async embedLayerFile(
    user: AuthUser,
    tenantId: string,
    layer: string,
    relativePath: string,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    const scopedPath = this.tenantScope.scopeLayerPath(wikiPrefix, relativePath);
    if (!scopedPath.toLowerCase().endsWith('.md')) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE',
        message: '仅支持 .md 文件嵌入',
      });
    }

    if (layer === 'wiki') {
      return this.client.request({
        method: 'POST',
        path: '/api/v1/wiki/embed',
        body: { path: scopedPath },
      });
    }

    if (layer === 'raw') {
      const outputPath = scopedPath.replace(/^\/?raw\//, '').replace(/^\//, '');
      const compileRes = await this.client.request<{ output_path?: string }>({
        method: 'POST',
        path: '/api/v1/tasks/compile',
        body: { input_paths: [scopedPath], output_path: outputPath },
      });
      const wikiPath = compileRes.output_path ?? outputPath;
      const embedRes = await this.client.request({
        method: 'POST',
        path: '/api/v1/wiki/embed',
        body: { path: wikiPath },
      });
      return { compile: compileRes, embed: embedRes };
    }

    throw new BadRequestException({
      code: 'UNSUPPORTED_LAYER',
      message: '仅 raw / wiki 层支持嵌入',
    });
  }

  async downloadLayerArchive(
    user: AuthUser,
    tenantId: string,
    layer: string,
    prefix?: string,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    return this.client.request<{
      buffer: Buffer;
      contentType: string;
      contentDisposition: string | null;
    }>({
      method: 'GET',
      path: `/api/v1/layers/${layer}/archive.zip`,
      query: { prefix: this.tenantScope.scopeLayerPrefix(wikiPrefix, prefix ?? '') },
      responseType: 'buffer',
    });
  }

  // ── data-structure ─────────────────────────────────────────

  async getDataTree(
    user: AuthUser,
    tenantId: string,
    layer: string,
    maxDepth?: number,
    maxNodes?: number,
  ) {
    await this.assertTenantAccess(user, tenantId);
    const intQuery = pickQueryInts({ max_depth: maxDepth, max_nodes: maxNodes });
    return this.client.request({
      method: 'GET',
      path: `/api/v1/data-structure/tree/${layer}`,
      ...(intQuery ? { query: intQuery } : {}),
    });
  }

  async createFolder(
    user: AuthUser,
    tenantId: string,
    body: { layer: string; name: string },
  ) {
    await this.assertTenantAccess(user, tenantId);
    // wiki 服务仅支持层根下单段目录名；租户根目录请预先创建或使用 wiki_prefix 单段名
    return this.client.request({
      method: 'POST',
      path: '/api/v1/data-structure/folders',
      body,
    });
  }

  async renameFolder(
    user: AuthUser,
    tenantId: string,
    body: { layer: string; path: string; new_name: string },
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'PATCH',
      path: '/api/v1/data-structure/folders/rename',
      body: {
        ...body,
        path: this.tenantScope.scopeLayerPath(wikiPrefix, body.path),
      },
    });
  }

  async deleteFolder(
    user: AuthUser,
    tenantId: string,
    layer: string,
    path: string,
  ) {
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'DELETE',
      path: '/api/v1/data-structure/folders',
      query: {
        layer,
        path: this.tenantScope.scopeLayerPath(wikiPrefix, path),
      },
    });
  }

  // ── dialogue ───────────────────────────────────────────────

  async dialogueRecall(
    tenantId: string,
    body: Record<string, unknown>,
    user?: AuthUser,
  ): Promise<DialogueRecallResponse> {
    if (user) await this.assertTenantAccess(user, tenantId);
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    const scopedBody = this.tenantScope.mergeRecallBody(
      wikiPrefix,
      body as { wiki_prefix?: string },
    );
    return this.client.request<DialogueRecallResponse>({
      method: 'POST',
      path: '/api/v1/dialogue/recall',
      body: scopedBody,
    });
  }

  async dialogueRecallTest(
    user: AuthUser,
    tenantId: string,
    body: Record<string, unknown>,
  ) {
    await this.assertTenantAccess(user, tenantId);
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    const scopedBody = this.tenantScope.mergeRecallBody(
      wikiPrefix,
      body as { wiki_prefix?: string },
    );
    return this.client.request({
      method: 'POST',
      path: '/api/v1/dialogue/recall-test',
      body: scopedBody,
    });
  }

  async getStopwords(user: AuthUser, tenantId: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({ method: 'GET', path: '/api/v1/dialogue/stopwords' });
  }

  async putStopwords(
    user: AuthUser,
    tenantId: string,
    body: { words: string[] },
  ) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'PUT',
      path: '/api/v1/dialogue/stopwords',
      body,
    });
  }

  // ── media ──────────────────────────────────────────────────

  async listMediaItems(user: AuthUser, tenantId: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({ method: 'GET', path: '/api/v1/media/items' });
  }

  async uploadMedia(user: AuthUser, tenantId: string, form: FormData) {
    await this.assertTenantAccess(user, tenantId);
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    const folder = form.get('target_folder');
    if (typeof folder === 'string' && folder && wikiPrefix) {
      form.set(
        'target_folder',
        this.tenantScope.scopeLayerPath(wikiPrefix, folder),
      );
    }
    return this.client.request({
      method: 'POST',
      path: '/api/v1/media/upload',
      body: form,
    });
  }

  async downloadMedia(user: AuthUser, tenantId: string, code: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request<{
      buffer: Buffer;
      contentType: string;
      contentDisposition: string | null;
    }>({
      method: 'GET',
      path: `/api/v1/media/${encodeURIComponent(code)}`,
      responseType: 'buffer',
    });
  }

  async deleteMedia(user: AuthUser, tenantId: string, code: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'DELETE',
      path: `/api/v1/media/${encodeURIComponent(code)}`,
    });
  }

  async mediaBackrefs(user: AuthUser, tenantId: string, code: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'GET',
      path: `/api/v1/media/${encodeURIComponent(code)}/backrefs`,
    });
  }

  async reindexMediaBackrefs(user: AuthUser, tenantId: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'POST',
      path: '/api/v1/media/reindex-backrefs',
    });
  }

  async mediaMetaSummary(user: AuthUser, tenantId: string) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'GET',
      path: '/api/v1/media/meta/summary',
    });
  }

  async exportMediaZip(user: AuthUser, tenantId: string, codes: string[]) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request<{
      buffer: Buffer;
      contentType: string;
      contentDisposition: string | null;
    }>({
      method: 'POST',
      path: '/api/v1/media/export-zip',
      body: { codes },
      responseType: 'buffer',
      timeoutMs: 120_000,
    });
  }

  async importMediaZip(user: AuthUser, tenantId: string, form: FormData) {
    await this.assertTenantAccess(user, tenantId);
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    const folder = form.get('target_folder');
    if (typeof folder === 'string' && folder && wikiPrefix) {
      form.set(
        'target_folder',
        this.tenantScope.scopeLayerPath(wikiPrefix, folder),
      );
    }
    return this.client.request({
      method: 'POST',
      path: '/api/v1/media/import-zip',
      body: form,
      timeoutMs: 120_000,
    });
  }

  async batchDeleteMedia(user: AuthUser, tenantId: string, codes: string[]) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'POST',
      path: '/api/v1/media/batch-delete',
      body: { codes },
    });
  }

  async polishText(
    user: AuthUser,
    tenantId: string,
    body: { content: string; instruction?: string },
  ) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'POST',
      path: '/api/v1/tasks/polish-text',
      body,
      timeoutMs: 120_000,
    });
  }

  async resolveMediaFromText(
    user: AuthUser,
    tenantId: string,
    body: { text?: string; codes?: string[] },
  ) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({
      method: 'POST',
      path: '/api/v1/media/resolve-from-text',
      body,
    });
  }

  async proxyJson(
    user: AuthUser,
    tenantId: string,
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ) {
    await this.assertTenantAccess(user, tenantId);
    return this.client.request({ method, path, body, query });
  }
}
