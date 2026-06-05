/**
 * 嵌入 Copilot 主体上下文（会话快照 + RuntimeContext）。
 * scopeList 空/未传、externalUserId 未传 → 运行期该维度不限制。
 */
export interface PrincipalContext {
  externalUserId?: string;
  scopeList?: string[];
}

const SCOPE_LIST_MAX = 50;

/** 从 JWT / 换票入参构建可写入 Session 的快照 */
export function buildPrincipalContextSnapshot(params: {
  externalUserId?: string;
  scopeList?: string[];
}): PrincipalContext | null {
  const ctx: PrincipalContext = {};
  if (params.externalUserId?.trim()) {
    ctx.externalUserId = params.externalUserId.trim();
  }
  const scopes = normalizeScopeList(params.scopeList);
  if (scopes.length > 0) {
    ctx.scopeList = scopes;
  }
  if (!ctx.externalUserId && !ctx.scopeList) {
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
  if (!ctx.externalUserId && !ctx.scopeList) {
    return undefined;
  }
  return ctx;
}
