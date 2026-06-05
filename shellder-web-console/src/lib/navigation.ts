/** Hash 路由下的应用 base（与 Vite `base` 一致，末尾无 slash） */
export function getAppBasePath(): string {
  return (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
}

/** 当前 Hash 路由路径（如 `/sessions`），不含 query */
export function getCurrentRoutePath(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash.replace(/^#/, '');
  const pathPart = hash.split('?')[0] || '/';
  return pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
}

export function isLoginRoute(): boolean {
  return getCurrentRoutePath().startsWith('/login');
}

/** 未登录时跳转登录页，可选携带 redirect 回跳路径 */
export function redirectToLoginPage(options?: { redirectPath?: string }): void {
  if (typeof window === 'undefined' || isLoginRoute()) return;
  const base = getAppBasePath();
  const current = options?.redirectPath ?? getCurrentRoutePath();
  const query = `?redirect=${encodeURIComponent(current)}`;
  window.location.href = `${window.location.origin}${base}/#/login${query}`;
}

/** 退出登录等场景，直接跳转登录页 */
export function redirectToLoginHome(): void {
  if (typeof window === 'undefined') return;
  const base = getAppBasePath();
  window.location.href = `${window.location.origin}${base}/#/login`;
}

/** 构建 Hash 路由完整 URL（含 origin、base、hash path 与 query） */
export function buildHashRouteUrl(path: string, searchParams?: URLSearchParams | string): string {
  const base = getAppBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const query =
    searchParams instanceof URLSearchParams
      ? searchParams.toString()
      : (searchParams ?? '');
  const hashPath = query ? `${normalized}?${query}` : normalized;
  if (typeof window === 'undefined') return `#${hashPath}`;
  return `${window.location.origin}${base}/#${hashPath}`;
}
