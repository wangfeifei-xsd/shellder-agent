import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import type { MeTenant } from '@/lib/auth';
import { listTenants, type TenantStatus } from '@/lib/tenant';

export interface TenantSelectItem {
  id: string;
  code: string;
  name: string;
}

/** 是否可从租户管理 API 拉全量目录（需 tenant 菜单或超管） */
export function canFetchTenantCatalogFromApi(
  me: { permissions: { isSuperAdmin: boolean; menus: string[] } } | null | undefined,
): boolean {
  if (!me) return false;
  return me.permissions.isSuperAdmin || me.permissions.menus.includes('tenant');
}

export function mergeTenantSelectItems(
  bound: MeTenant[],
  api: TenantSelectItem[],
  options?: { onlyEnabled?: boolean },
): TenantSelectItem[] {
  const onlyEnabled = options?.onlyEnabled !== false;
  const map = new Map<string, TenantSelectItem>();
  for (const t of bound) {
    if (onlyEnabled && t.status !== 'enabled') continue;
    map.set(t.id, { id: t.id, code: t.code, name: t.name });
  }
  for (const t of api) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN'),
  );
}

export function tenantSelectItemsToAntdOptions(items: TenantSelectItem[]) {
  return items.map((t) => ({
    value: t.id,
    label: `${t.name}（${t.code}）`,
  }));
}

/**
 * 分页拉取全部租户（后端 pageSize 上限 100，不可一次请求 200）。
 */
export async function fetchAllTenantsForSelect(
  query: { status?: TenantStatus } = { status: 'enabled' },
): Promise<TenantSelectItem[]> {
  const pageSize = 100;
  const all: TenantSelectItem[] = [];
  let page = 1;
  let total = 0;

  do {
    const res = await listTenants({ ...query, page, pageSize });
    total = res.total;
    for (const t of res.items) {
      all.push({ id: t.id, code: t.code, name: t.name });
    }
    page += 1;
  } while (all.length < total);

  return all;
}

export function useTenantSelectOptions(options?: {
  onlyEnabled?: boolean;
  /** 为 false 时不请求全量租户 API，仅使用当前用户绑定租户 */
  fetchCatalog?: boolean;
}) {
  const { me } = useAuth();
  const { activeTenantId, tenants: boundTenants } = useActiveTenant();
  const [apiTenants, setApiTenants] = useState<TenantSelectItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const onlyEnabled = options?.onlyEnabled !== false;
  const fetchCatalog = options?.fetchCatalog !== false;
  const canFetchApi = fetchCatalog && canFetchTenantCatalogFromApi(me);

  useEffect(() => {
    if (!canFetchApi) {
      setApiTenants([]);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    fetchAllTenantsForSelect(onlyEnabled ? { status: 'enabled' } : {})
      .then((items) => {
        if (!cancelled) setApiTenants(items);
      })
      .catch(() => {
        if (!cancelled) setApiTenants([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetchApi, onlyEnabled]);

  const items = useMemo(
    () => mergeTenantSelectItems(boundTenants, apiTenants, { onlyEnabled }),
    [boundTenants, apiTenants, onlyEnabled],
  );

  const selectOptions = useMemo(() => tenantSelectItemsToAntdOptions(items), [items]);

  const defaultTenantId = useMemo(() => {
    if (activeTenantId && items.some((t) => t.id === activeTenantId)) {
      return activeTenantId;
    }
    return items[0]?.id;
  }, [activeTenantId, items]);

  const defaultTenantIds = useMemo(
    () => (defaultTenantId ? [defaultTenantId] : []),
    [defaultTenantId],
  );

  return {
    items,
    selectOptions,
    defaultTenantId,
    defaultTenantIds,
    catalogLoading,
    canFetchApi,
    boundCount: boundTenants.length,
  };
}
