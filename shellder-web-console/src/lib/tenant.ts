import { apiFetch } from './api';

export type TenantStatus = 'enabled' | 'disabled';

export type TenantCapability = 'qa' | 'query' | 'action' | 'workflow';

export const CAPABILITY_OPTIONS: { value: TenantCapability; label: string }[] = [
  { value: 'qa', label: '问答型' },
  { value: 'query', label: '查询型' },
  { value: 'action', label: '操作型' },
  { value: 'workflow', label: '流程型' },
];

export const CAPABILITY_LABEL: Record<TenantCapability, string> = {
  qa: '问答型',
  query: '查询型',
  action: '操作型',
  workflow: '流程型',
};

export type DataIsolationStrategy = 'strict' | 'shared';

export interface TenantIsolation {
  dataIsolationStrategy: DataIsolationStrategy;
  restrictCrossTenant: boolean;
  connectorVisibleWithinTenant: boolean;
  toolVisibleWithinTenant: boolean;
  auditVisibleWithinTenant: boolean;
}

export interface TenantLimits {
  maxSessions: number;
  maxTasks: number;
}

export interface Tenant {
  id: string;
  code: string;
  name: string;
  status: TenantStatus;
  externalTenantId: string | null;
  adminUserId: string | null;
  remark: string | null;
  capabilities: TenantCapability[];
  limits: TenantLimits;
  isolation: TenantIsolation;
  createdAt: string;
  updatedAt: string;
}

export interface TenantStats {
  userCount: number;
  sessionCount: number;
  taskCount: number;
  toolCount: number;
  connectorCount: number;
}

export interface TenantDetail extends Tenant {
  stats: TenantStats;
}

export interface TenantListResult {
  items: Tenant[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TenantListQuery {
  keyword?: string;
  status?: TenantStatus;
  capability?: TenantCapability;
  page?: number;
  pageSize?: number;
}

export interface TenantConfigInput {
  capabilities?: TenantCapability[];
  limits?: Partial<TenantLimits>;
  isolation?: Partial<TenantIsolation>;
}

export interface TenantUpsertInput {
  name: string;
  code: string;
  status?: TenantStatus;
  adminUserId?: string;
  externalTenantId?: string;
  remark?: string;
  config?: TenantConfigInput;
}

const BASE = '/api/v1/tenants';

export function listTenants(query: TenantListQuery = {}) {
  return apiFetch<TenantListResult>(BASE, { query: query as Record<string, string | number> });
}

export function getTenant(id: string) {
  return apiFetch<TenantDetail>(`${BASE}/${id}`);
}

export function createTenant(input: TenantUpsertInput) {
  return apiFetch<Tenant>(BASE, { method: 'POST', body: input });
}

export function updateTenant(id: string, input: Partial<TenantUpsertInput>) {
  return apiFetch<Tenant>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateTenantStatus(id: string, status: TenantStatus) {
  return apiFetch<Tenant>(`${BASE}/${id}/status`, { method: 'PATCH', body: { status } });
}

export function getTenantIsolation(id: string) {
  return apiFetch<TenantIsolation>(`${BASE}/${id}/isolation`);
}

export function updateTenantIsolation(id: string, input: Partial<TenantIsolation>) {
  return apiFetch<TenantIsolation>(`${BASE}/${id}/isolation`, {
    method: 'PATCH',
    body: input,
  });
}
