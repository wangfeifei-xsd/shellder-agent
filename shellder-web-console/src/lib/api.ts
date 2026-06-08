import { redirectToLoginPage } from './navigation';

/** 开发/生产均优先走同源 /api（Vite 或 nginx 反代）；仅显式配置 VITE_API_BASE_URL 时用绝对地址 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function resolveApiOrigin(): string {
  if (API_BASE_URL) return API_BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  requestId?: string;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.error?.message ?? `请求失败（HTTP ${status}）`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error?.code ?? 'HTTP_ERROR';
    this.details = body.error?.details;
    this.requestId = body.requestId;
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalized, `${resolveApiOrigin()}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

const TOKEN_STORAGE_KEY = 'shellder.accessToken';
const ACTIVE_TENANT_STORAGE_KEY = 'shellder.activeTenantId';

function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const headers: Record<string, string> = {};
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  // 顶栏「当前操作租户」：供用户操作审计归属租户上下文（阶段 04）
  const activeTenantId = window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
  if (activeTenantId) headers['x-active-tenant-id'] = activeTenantId;
  return headers;
}

/** 401 时清理本地令牌并跳转登录页（登录页自身除外） */
function handleUnauthorized() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  redirectToLoginPage();
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options;

  const res = await fetch(buildUrl(path, query), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
    }
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    const fallbackMessage =
      text.trim().slice(0, 300) || `请求失败（HTTP ${res.status}）`;
    if (!body.error?.message) {
      body.error = {
        code: body.error?.code ?? 'HTTP_ERROR',
        message: fallbackMessage,
        details: body.error?.details,
      };
    }
    throw new ApiError(res.status, body);
  }

  if (text && data === null) {
    throw new ApiError(res.status || 500, {
      error: {
        code: 'INVALID_RESPONSE',
        message: text.trim().slice(0, 300) || '响应不是合法 JSON',
      },
      requestId: 'unknown',
    });
  }

  return data as T;
}
