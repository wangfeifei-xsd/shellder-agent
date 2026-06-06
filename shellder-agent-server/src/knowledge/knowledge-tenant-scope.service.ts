import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const WIKI_PREFIXES_MAX = 50;

/** 与 wiki data-structure API 对齐的目录树节点 */
export interface DataFolderTreeNode {
  path: string;
  title: string;
  children: DataFolderTreeNode[];
}

export interface MediaListItemLike {
  code?: string;
  folder?: string | null;
  target_folder?: string | null;
  [key: string]: unknown;
}

/**
 * 租户与 wiki 存储路径隔离。
 *
 * wiki 无内置多租户；平台在代理层注入 wiki 子路径前缀：
 * - 租户下所有 status=active 的 knowledge_base 均生效（各自 wiki_prefix）
 * - 未配置 wiki_prefix 的单条绑定 → 默认 `tenants/{tenantId}/`
 * - 无任何 active 绑定时 → 回落 `tenants/{tenantId}/`
 */
@Injectable()
export class KnowledgeTenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 租户下全部生效的 wiki 路径前缀（去重、有序） */
  async resolveWikiPrefixes(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.knowledgeBase.findMany({
      where: {
        tenantId,
        status: 'active',
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      select: { wikiPrefix: true },
    });

    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: string) => {
      const norm = this.normalizePrefix(raw);
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      out.push(norm);
    };

    for (const row of rows) {
      if (row.wikiPrefix != null && row.wikiPrefix.trim() !== '') {
        push(row.wikiPrefix);
      } else {
        push(`tenants/${tenantId}/`);
      }
    }

    if (out.length === 0) {
      push(`tenants/${tenantId}/`);
    }
    return out;
  }

  /** @deprecated 请优先使用 resolveWikiPrefixes；保留兼容仅返回第一条前缀 */
  async resolveWikiPrefix(tenantId: string): Promise<string> {
    const prefixes = await this.resolveWikiPrefixes(tenantId);
    return prefixes[0] ?? `tenants/${tenantId}/`;
  }

  /** 列表/召回查询：将 UI 相对 prefix 解析为 wiki 层内绝对路径（可多条） */
  resolveListQueryPrefixes(prefixes: string[], userPrefix?: string): string[] {
    const rel = (userPrefix ?? '').replace(/^\//, '');
    if (rel) {
      return [this.resolveLayerAbsolutePath(prefixes, rel)];
    }
    return prefixes.map((p) => this.normalizePrefix(p));
  }

  /** UI/树内相对路径 → wiki 层内绝对路径 */
  resolveLayerAbsolutePath(prefixes: string[], relativePath: string): string {
    const rel = (relativePath ?? '').replace(/^\//, '');
    if (!rel) {
      return prefixes.length === 1 ? this.normalizePrefix(prefixes[0]) : '';
    }
    for (const raw of prefixes) {
      const base = this.normalizePrefix(raw);
      const baseNoSlash = base.replace(/\/$/, '');
      if (rel === baseNoSlash || rel.startsWith(base)) {
        return rel;
      }
    }
    if (prefixes.length === 1) {
      return this.scopeLayerPath(prefixes, rel);
    }
    return rel;
  }

  /** 将层内相对 path/prefix 加上租户 wiki 根前缀 */
  scopeLayerPath(prefixes: string | string[], relativePath: string): string {
    const list = Array.isArray(prefixes) ? prefixes : [prefixes];
    const rel = (relativePath ?? '').replace(/^\//, '');
    if (!rel) {
      return list.length === 1 ? this.normalizePrefix(list[0]) : '';
    }
    for (const raw of list) {
      const base = this.normalizePrefix(raw);
      const baseNoSlash = base.replace(/\/$/, '');
      if (rel === baseNoSlash || rel.startsWith(base)) return rel;
    }
    if (list.length === 1) {
      const base = this.normalizePrefix(list[0]);
      if (!base) return rel;
      return `${base}${rel}`;
    }
    // 多库：相对路径须能唯一归属某一前缀，否则拒绝
    const matches = list.filter((raw) =>
      this.pathUnderWikiPrefix(
        raw,
        this.resolveLayerAbsolutePath(list, rel).replace(/\/$/, ''),
      ),
    );
    if (matches.length === 1) {
      return this.resolveLayerAbsolutePath(list, rel);
    }
    return rel;
  }

  scopeLayerPrefix(prefixes: string | string[], prefix: string): string {
    return this.scopeLayerPath(prefixes, prefix ?? '');
  }

  normalizeRelativeWikiPrefixes(raw?: string[]): string[] {
    if (!raw?.length) return [];
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const p = item.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!p || p.includes('..') || out.includes(p)) continue;
      out.push(p);
      if (out.length >= WIKI_PREFIXES_MAX) break;
    }
    return out;
  }

  assertRelativeWikiPrefixesInTenantScope(
    tenantWikiPrefixes: string | string[],
    raw?: string[],
  ): string[] {
    const prefixes = Array.isArray(tenantWikiPrefixes)
      ? tenantWikiPrefixes
      : [tenantWikiPrefixes];
    const relative = this.normalizeRelativeWikiPrefixes(raw);
    if (relative.length === 0) return [];

    for (const rel of relative) {
      if (!this.isRelativePathInTenantScope(prefixes, rel)) {
        throw new BadRequestException({
          code: 'WIKI_PREFIX_OUT_OF_SCOPE',
          message: `目录范围「${rel}」超出租户 wiki 路径前缀限制（${prefixes.join('、')}）`,
        });
      }
    }
    return relative;
  }

  mergeRecallBody<T extends { wiki_prefix?: string; wiki_prefixes?: string[] }>(
    wikiPrefixes: string | string[],
    body: T,
  ): Omit<T, 'wiki_prefix' | 'wiki_prefixes'> & { wiki_prefixes: string[] } {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const { wiki_prefix, wiki_prefixes, ...rest } = body;

    let relativePrefixes = this.normalizeRelativeWikiPrefixes(wiki_prefixes);
    if (relativePrefixes.length === 0 && wiki_prefix?.trim()) {
      relativePrefixes = this.normalizeRelativeWikiPrefixes([wiki_prefix]);
    }

    const scopedPrefixes =
      relativePrefixes.length > 0
        ? relativePrefixes.map((p) =>
            this.resolveLayerAbsolutePath(prefixes, p).replace(/\/$/, ''),
          )
        : prefixes.map((p) => this.normalizePrefix(p).replace(/\/$/, ''));

    const seen = new Set<string>();
    const deduped = scopedPrefixes.filter((p) => {
      if (!p || seen.has(p)) return false;
      seen.add(p);
      return true;
    });

    return { ...rest, wiki_prefixes: deduped };
  }

  normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/^\/+/, '');
    if (!trimmed) return '';
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  /** 层内 / media 路径是否落在指定 wiki 前缀下 */
  pathUnderWikiPrefix(wikiPrefix: string, path: string): boolean {
    const base = this.normalizePrefix(wikiPrefix).replace(/\/$/, '');
    const p = (path ?? '').replace(/^\/+|\/+$/g, '');
    if (!base) return !!p;
    if (!p) return false;
    return p === base || p.startsWith(`${base}/`);
  }

  /** 返回与 path 最匹配的前缀（最长前缀优先） */
  findLongestMatchingWikiPrefix(
    wikiPrefixes: string | string[],
    path: string,
  ): string | null {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const p = (path ?? '').replace(/^\/+|\/+$/g, '');
    if (!p) return null;
    let best: string | null = null;
    let bestLen = -1;
    for (const raw of prefixes) {
      if (!this.pathUnderWikiPrefix(raw, p)) continue;
      const len = this.normalizePrefix(raw).replace(/\/$/, '').length;
      if (len > bestLen) {
        bestLen = len;
        best = raw;
      }
    }
    return best;
  }

  isPathInTenantScope(wikiPrefixes: string | string[], path: string): boolean {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const p = (path ?? '').replace(/^\/+|\/+$/g, '');
    if (!p) return false;
    if (prefixes.some((raw) => this.pathUnderWikiPrefix(raw, p))) {
      return true;
    }
    // 单库：manifest folder 可能为相对层内路径（如 sub），补前缀后再判
    if (prefixes.length === 1) {
      const scoped = `${this.normalizePrefix(prefixes[0])}${p}`.replace(
        /\/+/g,
        '/',
      );
      return this.pathUnderWikiPrefix(prefixes[0], scoped.replace(/\/$/, ''));
    }
    return false;
  }

  isRelativePathInTenantScope(
    wikiPrefixes: string | string[],
    relativePath: string,
  ): boolean {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const rel = (relativePath ?? '').trim().replace(/^\//, '');
    if (!rel || rel.includes('..')) return false;
    const abs = this.resolveLayerAbsolutePath(prefixes, rel);
    return this.isPathInTenantScope(
      prefixes,
      abs.replace(/\/$/, ''),
    );
  }

  stripPathToTenantRelative(
    wikiPrefixes: string | string[],
    path: string,
  ): string {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const p = (path ?? '').replace(/^\/+|\/+$/g, '');
    if (!p) return '';

    const matched = this.findLongestMatchingWikiPrefix(prefixes, p);
    if (!matched) return p;

    const base = this.normalizePrefix(matched).replace(/\/$/, '');
    if (p === base) {
      return prefixes.length > 1 ? `${base}/` : '';
    }
    if (p.startsWith(`${base}/`)) {
      const rest = p.slice(base.length + 1);
      return prefixes.length > 1 ? `${base}/${rest}` : rest;
    }
    return p;
  }

  /**
   * media 上传/导入：TreeSelect 值 → wiki manifest target_folder（层内绝对路径）。
   * 多库绑定时禁止层根默认 objects/，须显式选择某一库目录。
   */
  resolveMediaTargetFolder(
    wikiPrefixes: string | string[],
    rawFromTree: string | undefined,
  ): string {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const rel = (rawFromTree ?? '').trim().replace(/^\/+/, '').replace(/\/$/, '');

    if (!rel) {
      if (prefixes.length > 1) {
        throw new BadRequestException({
          code: 'MEDIA_FOLDER_REQUIRED',
          message:
            '当前租户绑定多个知识库，上传或导入须选择目标目录，不可使用层根默认 objects/',
        });
      }
      return '';
    }

    const abs = this.resolveLayerAbsolutePath(prefixes, rel);
    const normalized = abs.replace(/^\/+|\/+$/g, '');
    if (!normalized || !this.isPathInTenantScope(prefixes, normalized)) {
      throw new BadRequestException({
        code: 'WIKI_PREFIX_OUT_OF_SCOPE',
        message: `媒体目标目录「${rel}」不在租户 wiki 路径前缀范围内（${prefixes.join('、')}）`,
      });
    }
    return normalized;
  }

  filterDataTreeToTenantScope(
    tree: DataFolderTreeNode,
    wikiPrefixes: string | string[],
  ): DataFolderTreeNode {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    if (prefixes.length === 1) {
      return this.filterSinglePrefixTree(tree, prefixes[0]);
    }

    const children: DataFolderTreeNode[] = [];
    for (const raw of prefixes) {
      const base = this.normalizePrefix(raw);
      const hit = this.findTreeNodeForWikiPrefix(tree, prefixes, raw);
      if (hit) {
        const nodePath = hit.path === '' ? base : this.normalizePrefix(hit.path);
        children.push({
          path: nodePath,
          title: hit.title || nodePath.replace(/\/$/, ''),
          children: hit.children ?? [],
        });
      } else {
        children.push({
          path: base,
          title: `${base.replace(/\/$/, '')}（尚未创建）`,
          children: [],
        });
      }
    }

    return {
      path: '',
      title: '租户知识库',
      children,
    };
  }

  private filterSinglePrefixTree(
    tree: DataFolderTreeNode,
    wikiPrefix: string,
  ): DataFolderTreeNode {
    const base = this.normalizePrefix(wikiPrefix);
    if (!base) return tree;

    const hit = this.findTreeNodeForWikiPrefix(tree, [wikiPrefix], wikiPrefix);
    if (hit) {
      return this.rebaseTreeAsRoot(hit);
    }

    const label = base.replace(/\/$/, '').split('/').pop() || '租户目录';
    return {
      path: '',
      title: `${label}（尚未创建）`,
      children: [],
    };
  }

  findTreeNodeByPath(
    node: DataFolderTreeNode,
    targetPath: string,
  ): DataFolderTreeNode | null {
    const want = this.normalizePrefix(targetPath);
    const nodePath =
      node.path === '' ? '' : this.normalizePrefix(node.path);
    if (want === nodePath) return node;
    for (const child of node.children ?? []) {
      const found = this.findTreeNodeByPath(child, targetPath);
      if (found) return found;
    }
    return null;
  }

  /** 按 wiki 路径前缀在层内目录树中定位节点（含 scope 补全与后缀匹配），保留完整子树 */
  findTreeNodeForWikiPrefix(
    tree: DataFolderTreeNode,
    wikiPrefixes: string[],
    rawPrefix: string,
  ): DataFolderTreeNode | null {
    for (const candidate of this.buildWikiPrefixTreePathCandidates(
      tree,
      wikiPrefixes,
      rawPrefix,
    )) {
      const hit = this.findTreeNodeByPath(tree, candidate);
      if (hit) return hit;
    }
    return null;
  }

  private buildWikiPrefixTreePathCandidates(
    tree: DataFolderTreeNode,
    wikiPrefixes: string[],
    rawPrefix: string,
  ): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (path: string) => {
      const normalized = this.normalizePrefix(path);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    };

    push(rawPrefix);
    const trimmed = this.normalizePrefix(rawPrefix).replace(/\/$/, '');
    if (wikiPrefixes.length === 1) {
      push(this.scopeLayerPath(wikiPrefixes, trimmed));
      if (!trimmed) {
        push(this.scopeLayerPath(wikiPrefixes, ''));
      }
    }

    const suffixHit = trimmed
      ? this.findTreeNodeByBestSuffixMatch(tree, trimmed, wikiPrefixes)
      : null;
    if (suffixHit?.path) {
      push(suffixHit.path);
    }

    return out;
  }

  private findTreeNodeByBestSuffixMatch(
    tree: DataFolderTreeNode,
    suffix: string,
    wikiPrefixes: string[],
  ): DataFolderTreeNode | null {
    const want = suffix.replace(/^\/+|\/+$/g, '');
    if (!want) return null;

    let best: DataFolderTreeNode | null = null;
    let bestLen = -1;

    const walk = (node: DataFolderTreeNode) => {
      const p = node.path === '' ? '' : node.path.replace(/\/$/, '');
      if (
        p &&
        (p === want || p.endsWith(`/${want}`)) &&
        this.isPathInTenantScope(wikiPrefixes, p)
      ) {
        if (p.length > bestLen) {
          bestLen = p.length;
          best = node;
        }
      }
      for (const child of node.children ?? []) {
        walk(child);
      }
    };

    walk(tree);
    return best;
  }

  rebaseTreeAsRoot(node: DataFolderTreeNode): DataFolderTreeNode {
    const basePath = node.path === '' ? '' : this.normalizePrefix(node.path);

    const toRelativePath = (absPath: string): string => {
      if (!absPath) return '';
      const norm = this.normalizePrefix(absPath);
      if (!basePath) return norm.replace(/\/$/, '') ? norm : '';
      if (norm === basePath) return '';
      if (norm.startsWith(basePath)) {
        return norm.slice(basePath.length);
      }
      return absPath;
    };

    const walk = (n: DataFolderTreeNode, isRoot: boolean): DataFolderTreeNode => ({
      path: isRoot ? '' : toRelativePath(n.path),
      title: isRoot ? n.title || '租户目录' : n.title,
      children: (n.children ?? []).map((c) => walk(c, false)),
    });

    return walk(node, true);
  }

  assertRelativePathInTenantScope(
    wikiPrefixes: string | string[],
    relativePath: string,
  ): void {
    const rel = (relativePath ?? '').trim().replace(/^\//, '');
    if (!rel) {
      throw new BadRequestException({
        code: 'WIKI_PREFIX_OUT_OF_SCOPE',
        message: '不能操作层根目录',
      });
    }
    if (!this.isRelativePathInTenantScope(wikiPrefixes, rel)) {
      const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
      throw new BadRequestException({
        code: 'WIKI_PREFIX_OUT_OF_SCOPE',
        message: `路径「${rel}」超出租户 wiki 路径前缀限制（${prefixes.join('、')}）`,
      });
    }
  }

  assertCreateFolderInTenantScope(
    wikiPrefixes: string | string[],
    name: string,
    parent?: string,
  ): void {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const seg = (name ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!seg || seg.includes('/') || seg === '.' || seg === '..') {
      throw new BadRequestException({
        code: 'WIKI_PREFIX_OUT_OF_SCOPE',
        message: '目录名须为单层路径段',
      });
    }

    const parentRel = (parent ?? '').trim().replace(/^\//, '').replace(/\/$/, '');

    if (!parentRel) {
      if (prefixes.length > 1) {
        throw new BadRequestException({
          code: 'WIKI_PREFIX_OUT_OF_SCOPE',
          message:
            '不可在「租户知识库」虚拟根下新建目录；请先选择已绑定的知识库目录，再在其下创建子目录',
        });
      }
      const scopedParent = this.scopeLayerPath(prefixes, '');
      const newAbs = `${scopedParent}${seg}/`.replace(/\/+/g, '/');
      if (
        !this.isPathInTenantScope(
          prefixes,
          newAbs.replace(/\/$/, ''),
        )
      ) {
        throw new BadRequestException({
          code: 'WIKI_PREFIX_OUT_OF_SCOPE',
          message: `无权创建目录「${seg}」：不在本租户 wiki 路径前缀范围内`,
        });
      }
      return;
    }

    if (!this.isRelativePathInTenantScope(prefixes, parentRel)) {
      throw new BadRequestException({
        code: 'WIKI_PREFIX_OUT_OF_SCOPE',
        message: `父目录「${parentRel}」不在本租户 wiki 路径前缀范围内（${prefixes.join('、')}）`,
      });
    }

    const newRel = `${parentRel}/${seg}`;
    const abs = this.resolveLayerAbsolutePath(prefixes, newRel);
    if (!this.isPathInTenantScope(prefixes, abs.replace(/\/$/, ''))) {
      throw new BadRequestException({
        code: 'WIKI_PREFIX_OUT_OF_SCOPE',
        message: `无权在「${parentRel}」下创建「${seg}」`,
      });
    }
  }

  filterMediaItems<T extends MediaListItemLike>(
    wikiPrefixes: string | string[],
    items: T[],
  ): T[] {
    const prefixes = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    return items
      .filter((item) => {
        const folder = String(item.folder ?? item.target_folder ?? '');
        return this.isPathInTenantScope(prefixes, folder);
      })
      .map((item) => {
        const folder = String(item.folder ?? item.target_folder ?? '');
        const rel = this.stripPathToTenantRelative(prefixes, folder);
        return {
          ...item,
          folder: rel,
          target_folder: rel,
        };
      });
  }
}
