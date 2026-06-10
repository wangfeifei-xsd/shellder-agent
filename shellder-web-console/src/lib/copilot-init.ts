import { parseScopeListFromQuery } from '@/lib/scope-list';
import { parseWikiPrefixesFromQuery } from '@/lib/wiki-prefixes';

/** 换票接口允许的字段（勿把 postMessage 的 type 等元数据传给服务端） */
export interface CopilotTokenExchangeParams {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  externalTenantId?: string;
  externalUserId?: string;
  scopeList?: string[];
  wikiPrefixes?: string[];
}

export const COPILOT_INIT_MESSAGE_TYPE = 'copilot:init';
/** 嵌入页挂载并准备好接收 init 后向父页发送 */
export const COPILOT_READY_MESSAGE_TYPE = 'copilot:ready';

/** 从 document.referrer 解析父页 origin（跨域嵌入） */
export function getCopilotParentOrigin(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

/** 同源预览或 referrer 匹配的跨域父页 */
export function isAllowedCopilotParentOrigin(origin: string): boolean {
  if (!origin) return false;
  if (typeof window !== 'undefined' && origin === window.location.origin) return true;
  const parentOrigin = getCopilotParentOrigin();
  return !!parentOrigin && origin === parentOrigin;
}

/** postMessage 目标：跨域时发往父页 origin，同源预览走当前 origin */
export function resolveCopilotPostMessageTarget(): string {
  if (typeof window === 'undefined') return '*';
  return getCopilotParentOrigin() ?? window.location.origin;
}

function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function normalizeWikiPrefixList(raw: unknown): string[] | undefined {
  const list = normalizeStringArray(raw);
  if (!list) return undefined;
  const normalized = list
    .map((s) => s.replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

/** 从 postMessage / 父页注入对象提取换票参数 */
export function pickCopilotTokenExchangeParams(
  raw: Record<string, unknown> | null | undefined,
): CopilotTokenExchangeParams | null {
  if (!raw) return null;
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : '';
  const clientSecret =
    typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : '';
  if (!clientId || !clientSecret) return null;

  const tenantId =
    typeof raw.tenantId === 'string' && raw.tenantId.trim()
      ? raw.tenantId.trim()
      : undefined;
  const externalTenantId =
    typeof raw.externalTenantId === 'string' && raw.externalTenantId.trim()
      ? raw.externalTenantId.trim()
      : undefined;
  const externalUserId =
    typeof raw.externalUserId === 'string' && raw.externalUserId.trim()
      ? raw.externalUserId.trim()
      : undefined;

  const scopeList =
    normalizeStringArray(raw.scopeList) ??
    parseScopeListFromQuery(
      typeof raw.scopeList === 'string' ? raw.scopeList : null,
    );
  const wikiPrefixes =
    normalizeWikiPrefixList(raw.wikiPrefixes) ??
    parseWikiPrefixesFromQuery(
      typeof raw.wikiPrefixes === 'string' ? raw.wikiPrefixes : null,
    );

  return {
    clientId,
    clientSecret,
    tenantId,
    externalTenantId,
    externalUserId,
    scopeList,
    wikiPrefixes,
  };
}

/** 从 Hash 路由 searchParams 提取换票参数 */
export function pickCopilotTokenExchangeParamsFromSearchParams(
  searchParams: URLSearchParams,
): CopilotTokenExchangeParams | null {
  const clientId = searchParams.get('clientId')?.trim() ?? '';
  const clientSecret = searchParams.get('clientSecret')?.trim() ?? '';
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    tenantId: searchParams.get('tenantId')?.trim() || undefined,
    externalTenantId: searchParams.get('externalTenantId')?.trim() || undefined,
    externalUserId: searchParams.get('externalUserId')?.trim() || undefined,
    scopeList: parseScopeListFromQuery(searchParams.get('scopeList')),
    wikiPrefixes: parseWikiPrefixesFromQuery(searchParams.get('wikiPrefixes')),
  };
}

/** 构建 postMessage 初始化载荷（嵌入 / 预览页共用） */
export function buildCopilotInitMessage(
  params: CopilotTokenExchangeParams,
): Record<string, unknown> {
  return {
    type: COPILOT_INIT_MESSAGE_TYPE,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    ...(params.externalTenantId ? { externalTenantId: params.externalTenantId } : {}),
    ...(params.externalUserId ? { externalUserId: params.externalUserId } : {}),
    ...(params.scopeList?.length ? { scopeList: params.scopeList } : {}),
    ...(params.wikiPrefixes?.length ? { wikiPrefixes: params.wikiPrefixes } : {}),
  };
}
