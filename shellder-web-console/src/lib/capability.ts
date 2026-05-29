import { apiFetch } from './api';

export type CapabilityType = 'qa' | 'query' | 'action' | 'workflow';
export type CapabilityStatus = 'enabled' | 'disabled';
export type RoutingRuleStatus = 'enabled' | 'disabled';

export interface Capability {
  id: string;
  tenantId: string;
  type: CapabilityType;
  name: string;
  description: string | null;
  applicableSystem: string | null;
  dependentTools: string[];
  permissionRequirements: string[];
  priority: number;
  status: CapabilityStatus;
  createdAt: string;
  updatedAt: string;
  routingRules?: { id: string; name: string }[];
}

export interface RoutingRule {
  id: string;
  tenantId: string;
  capabilityId: string;
  name: string;
  description: string | null;
  conditions: RoutingConditions;
  toolIds: string[];
  priority: number;
  needConfirmation: boolean;
  status: RoutingRuleStatus;
  createdAt: string;
  updatedAt: string;
  capability?: { id: string; name: string; type: CapabilityType };
}

export interface RoutingConditions {
  keywords?: string[];
  patterns?: string[];
  intents?: string[];
}

export interface RoutingTestResult {
  capabilityType: string;
  capabilityName: string;
  reason: string;
  candidates: RoutingCandidate[];
  needConfirmation: boolean;
}

export interface RoutingCandidate {
  capabilityId: string;
  capabilityName: string;
  type: string;
  score: number;
  toolIds: string[];
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateCapabilityInput {
  tenantId: string;
  type: CapabilityType;
  name: string;
  description?: string;
  applicableSystem?: string;
  dependentTools?: string[];
  permissionRequirements?: string[];
  priority?: number;
}

export type UpdateCapabilityInput = Partial<Omit<CreateCapabilityInput, 'tenantId'>>;

export interface CreateRoutingRuleInput {
  tenantId: string;
  capabilityId: string;
  name: string;
  description?: string;
  conditions: RoutingConditions;
  toolIds?: string[];
  priority?: number;
  needConfirmation?: boolean;
}

export type UpdateRoutingRuleInput = Partial<Omit<CreateRoutingRuleInput, 'tenantId'>>;

type QueryParams = Record<string, string | number | undefined | null>;

// ── 能力目录 API ─────────────────────────────────────────

const CAP_BASE = '/api/v1/capabilities';

export function listCapabilities(
  query: {
    tenantId?: string;
    type?: CapabilityType;
    status?: CapabilityStatus;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<Capability>>(CAP_BASE, { query: query as QueryParams });
}

export function getCapability(id: string) {
  return apiFetch<Capability & { routingRules: RoutingRule[] }>(`${CAP_BASE}/${id}`);
}

export function createCapability(input: CreateCapabilityInput) {
  return apiFetch<Capability>(CAP_BASE, { method: 'POST', body: input });
}

export function updateCapability(id: string, input: UpdateCapabilityInput) {
  return apiFetch<Capability>(`${CAP_BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateCapabilityStatus(id: string, status: CapabilityStatus) {
  return apiFetch<Capability>(`${CAP_BASE}/${id}/status`, { method: 'PATCH', body: { status } });
}

export function deleteCapability(id: string) {
  return apiFetch<{ id: string }>(`${CAP_BASE}/${id}`, { method: 'DELETE' });
}

// ── 路由规则 API ─────────────────────────────────────────

const RULE_BASE = '/api/v1/routing-rules';

export function listRoutingRules(
  query: {
    tenantId?: string;
    capabilityId?: string;
    status?: RoutingRuleStatus;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<RoutingRule>>(RULE_BASE, { query: query as QueryParams });
}

export function getRoutingRule(id: string) {
  return apiFetch<RoutingRule>(`${RULE_BASE}/${id}`);
}

export function createRoutingRule(input: CreateRoutingRuleInput) {
  return apiFetch<RoutingRule>(RULE_BASE, { method: 'POST', body: input });
}

export function updateRoutingRule(id: string, input: UpdateRoutingRuleInput) {
  return apiFetch<RoutingRule>(`${RULE_BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateRoutingRuleStatus(id: string, status: RoutingRuleStatus) {
  return apiFetch<RoutingRule>(`${RULE_BASE}/${id}/status`, { method: 'PATCH', body: { status } });
}

export function deleteRoutingRule(id: string) {
  return apiFetch<{ id: string }>(`${RULE_BASE}/${id}`, { method: 'DELETE' });
}

// ── 路由测试 API ─────────────────────────────────────────

export function testRouting(input: { tenantId: string; input: string; userId?: string }) {
  return apiFetch<RoutingTestResult>('/api/v1/routing/test', { method: 'POST', body: input });
}

// ── 展示元数据 ────────────────────────────────────────────

export const CAPABILITY_TYPE_META: Record<CapabilityType, { label: string; color: string }> = {
  qa: { label: '问答型', color: 'blue' },
  query: { label: '查询型', color: 'cyan' },
  action: { label: '操作型', color: 'orange' },
  workflow: { label: '流程型', color: 'purple' },
};

export const CAPABILITY_TYPE_OPTIONS: { value: CapabilityType; label: string }[] = [
  { value: 'qa', label: '问答型' },
  { value: 'query', label: '查询型' },
  { value: 'action', label: '操作型' },
  { value: 'workflow', label: '流程型' },
];
