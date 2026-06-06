/**
 * 嵌入 Copilot 主体上下文（会话快照 + RuntimeContext）。
 * scopeList 空/未传、externalUserId 未传 → 运行期该维度不限制。
 * wikiPrefixes 空/未传 → 问答型召回使用租户 wiki 根目录全范围。
 */
export interface PrincipalContext {
  externalUserId?: string;
  scopeList?: string[];
  /** 问答型 wiki 子目录范围（层内相对路径，不含租户根前缀） */
  wikiPrefixes?: string[];
}

const SCOPE_LIST_MAX = 50;
const WIKI_PREFIXES_MAX = 50;

/** 换票入参 wikiPrefixes 规范化（去空、截断上限） */
export function normalizeWikiPrefixes(wikiPrefixes?: string[]): string[] {
  if (!wikiPrefixes?.length) return [];
  const out: string[] = [];
  for (const item of wikiPrefixes) {
    if (typeof item !== 'string') continue;
    const s = item.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!s || s.includes('..') || out.includes(s)) continue;
    out.push(s);
    if (out.length >= WIKI_PREFIXES_MAX) break;
  }
  return out;
}

/** 从 JWT / 换票入参构建可写入 Session 的快照 */
export function buildPrincipalContextSnapshot(params: {
  externalUserId?: string;
  scopeList?: string[];
  wikiPrefixes?: string[];
}): PrincipalContext | null {
  const ctx: PrincipalContext = {};
  if (params.externalUserId?.trim()) {
    ctx.externalUserId = params.externalUserId.trim();
  }
  const scopes = normalizeScopeList(params.scopeList);
  if (scopes.length > 0) {
    ctx.scopeList = scopes;
  }
  const wikiPrefixes = normalizeWikiPrefixes(params.wikiPrefixes);
  if (wikiPrefixes.length > 0) {
    ctx.wikiPrefixes = wikiPrefixes;
  }
  if (!ctx.externalUserId && !ctx.scopeList && !ctx.wikiPrefixes) {
    return null;
  }
  return ctx;
}

/** 换票入参 scopeList 规范化（去空、截断上限） */
export function normalizeScopeList(scopeList?: string[]): string[] {
  if (!scopeList?.length) return [];
  const out: string[] = [];
  for (const item of scopeList) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= SCOPE_LIST_MAX) break;
  }
  return out;
}

export function parsePrincipalContextFromDb(
  value: unknown,
): PrincipalContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const ctx: PrincipalContext = {};
  if (typeof raw.externalUserId === 'string' && raw.externalUserId.trim()) {
    ctx.externalUserId = raw.externalUserId.trim();
  }
  const scopes = normalizeScopeList(
    Array.isArray(raw.scopeList)
      ? (raw.scopeList as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  );
  if (scopes.length > 0) {
    ctx.scopeList = scopes;
  }
  const wikiPrefixes = normalizeWikiPrefixes(
    Array.isArray(raw.wikiPrefixes)
      ? (raw.wikiPrefixes as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  );
  if (wikiPrefixes.length > 0) {
    ctx.wikiPrefixes = wikiPrefixes;
  }
  if (!ctx.externalUserId && !ctx.scopeList && !ctx.wikiPrefixes) {
    return undefined;
  }
  return ctx;
}
