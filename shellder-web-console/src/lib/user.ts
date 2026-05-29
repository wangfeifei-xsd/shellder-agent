import { apiFetch } from './api';
import { UserStatus } from './auth';

export interface UserRoleRef {
  id: string;
  code: string;
  name: string;
}

export interface UserTenantRef {
  id: string;
  code: string;
  name: string;
  status: UserStatus;
}

export interface PlatformUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  status: UserStatus;
  isSystem: boolean;
  remark: string | null;
  roles: UserRoleRef[];
  tenants: UserTenantRef[];
  createdAt: string;
  updatedAt: string;
}

export interface UserListResult {
  items: PlatformUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserListQuery {
  keyword?: string;
  status?: UserStatus;
  tenantId?: string;
  roleId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName?: string;
  email?: string;
  status?: UserStatus;
  remark?: string;
  roleIds?: string[];
  tenantIds?: string[];
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'username'>>;

const BASE = '/api/v1/users';

export function listUsers(query: UserListQuery = {}) {
  return apiFetch<UserListResult>(BASE, {
    query: query as Record<string, string | number>,
  });
}

export function getUser(id: string) {
  return apiFetch<PlatformUser>(`${BASE}/${id}`);
}

export function createUser(input: CreateUserInput) {
  return apiFetch<PlatformUser>(BASE, { method: 'POST', body: input });
}

export function updateUser(id: string, input: UpdateUserInput) {
  return apiFetch<PlatformUser>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateUserStatus(id: string, status: UserStatus) {
  return apiFetch<PlatformUser>(`${BASE}/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function deleteUser(id: string) {
  return apiFetch<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}
