'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { clearToken, fetchMe, getToken, MeResponse } from '@/lib/auth';

interface AuthContextValue {
  me?: MeResponse;
  loading: boolean;
  reload: () => Promise<void>;
  logout: () => void;
  hasMenu: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!getToken()) {
      setMe(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setMe(await fetchMe());
    } catch {
      // 401 已由 apiFetch 统一跳转登录；此处仅清理状态
      setMe(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setMe(undefined);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, []);

  const hasMenu = useCallback(
    (key: string) => {
      if (!me) return false;
      const { menus, isSuperAdmin } = me.permissions;
      return isSuperAdmin || menus.includes('*') || menus.includes(key);
    },
    [me],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <AuthContext.Provider value={{ me, loading, reload, logout, hasMenu }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return ctx;
}
