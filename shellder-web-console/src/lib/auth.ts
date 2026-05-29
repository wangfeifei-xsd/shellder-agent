import { apiFetch } from './api';

export const TOKEN_STORAGE_KEY = 'shellder.accessToken';

export type UserStatus = 'enabled' | 'disabled';
export type CapabilityKey = 'qa' | 'query' | 'action' | 'workflow';

export interface EffectivePermissions {
  menus: string[];
  modules: string[];
  toolScopes: string[];
  capabilities: CapabilityKey[];
  canApproveHighRisk: boolean;
  isSuperAdmin: boolean;
}

export interface MeRole {
  id: string;
  code: string;
  name: string;
}

export interface MeTenant {
  id: string;
  code: string;
  name: string;
  status: UserStatus;
}

export interface MeResponse {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  status: UserStatus;
  roles: MeRole[];
  tenants: MeTenant[];
  permissions: EffectivePermissions;
}

export interface LoginResponse {
  accessToken: string;
  user: { id: string; username: string; displayName: string | null };
}

export interface CatalogItem {
  key: string;
  label: string;
}

export interface PermissionCatalog {
  menus: CatalogItem[];
  modules: CatalogItem[];
  capabilities: CatalogItem[];
}

const BASE = '/api/v1/auth';

export function login(username: string, password: string) {
  return apiFetch<LoginResponse>(`${BASE}/login`, {
    method: 'POST',
    body: { username, password },
  });
}

export function fetchMe() {
  return apiFetch<MeResponse>(`${BASE}/me`);
}

export function fetchCatalog() {
  return apiFetch<PermissionCatalog>(`${BASE}/catalog`);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}
