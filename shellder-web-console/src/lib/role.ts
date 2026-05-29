import { apiFetch } from './api';
import { CapabilityKey } from './auth';

export interface RolePolicy {
  capabilities: CapabilityKey[];
  canApproveHighRisk: boolean;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  menus: string[];
  modules: string[];
  toolScopes: string[];
  policy: RolePolicy;
  isSystem: boolean;
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleListResult {
  items: Role[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string;
  menus?: string[];
  modules?: string[];
  toolScopes?: string[];
  policy?: Partial<RolePolicy>;
}

export type UpdateRoleInput = Partial<Omit<CreateRoleInput, 'code'>>;

const BASE = '/api/v1/roles';

export function listRoles(query: { keyword?: string; page?: number; pageSize?: number } = {}) {
  return apiFetch<RoleListResult>(BASE, {
    query: query as Record<string, string | number>,
  });
}

export function getRole(id: string) {
  return apiFetch<Role>(`${BASE}/${id}`);
}

export function createRole(input: CreateRoleInput) {
  return apiFetch<Role>(BASE, { method: 'POST', body: input });
}

export function updateRole(id: string, input: UpdateRoleInput) {
  return apiFetch<Role>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function deleteRole(id: string) {
  return apiFetch<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}

// ── 权限策略（按角色维度） ──────────────────────────────

export interface PermissionPolicyItem {
  roleId: string;
  roleCode: string;
  roleName: string;
  isSystem: boolean;
  capabilities: CapabilityKey[];
  canApproveHighRisk: boolean;
}

const POLICY_BASE = '/api/v1/permission-policies';

export function listPermissionPolicies() {
  return apiFetch<{ items: PermissionPolicyItem[] }>(POLICY_BASE);
}

export function updatePermissionPolicy(
  roleId: string,
  input: { capabilities?: CapabilityKey[]; canApproveHighRisk?: boolean },
) {
  return apiFetch<PermissionPolicyItem>(`${POLICY_BASE}/${roleId}`, {
    method: 'PATCH',
    body: input,
  });
}
