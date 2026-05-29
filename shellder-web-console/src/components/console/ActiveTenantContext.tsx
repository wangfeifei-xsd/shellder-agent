'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { MeTenant } from '@/lib/auth';

const STORAGE_KEY = 'shellder.activeTenantId';

interface ActiveTenantContextValue {
  activeTenantId?: string;
  setActiveTenantId: (id?: string) => void;
  tenants: MeTenant[];
  loading: boolean;
}

const ActiveTenantContext = createContext<ActiveTenantContextValue | null>(null);

export function ActiveTenantProvider({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const [activeTenantId, setActiveTenantIdState] = useState<string | undefined>();

  // 顶栏可选租户来自当前用户绑定且启用的租户（多租户）
  const tenants = useMemo(
    () => (me?.tenants ?? []).filter((t) => t.status === 'enabled'),
    [me],
  );

  const setActiveTenantId = useCallback((id?: string) => {
    setActiveTenantIdState(id);
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || tenants.length === 0) return;
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? undefined;
    const valid = stored && tenants.some((t) => t.id === stored) ? stored : tenants[0].id;
    setActiveTenantIdState(valid);
  }, [tenants]);

  return (
    <ActiveTenantContext.Provider
      value={{ activeTenantId, setActiveTenantId, tenants, loading }}
    >
      {children}
    </ActiveTenantContext.Provider>
  );
}

export function useActiveTenant(): ActiveTenantContextValue {
  const ctx = useContext(ActiveTenantContext);
  if (!ctx) {
    throw new Error('useActiveTenant 必须在 ActiveTenantProvider 内使用');
  }
  return ctx;
}
