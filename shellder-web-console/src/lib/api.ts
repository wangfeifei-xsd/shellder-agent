export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

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
  const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL}/`);
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
  if (!window.location.pathname.startsWith('/login')) {
    const redirect = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?redirect=${redirect}`;
  }
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
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
    }
    throw new ApiError(res.status, (data ?? {}) as Partial<ApiErrorBody>);
  }

  return data as T;
}
