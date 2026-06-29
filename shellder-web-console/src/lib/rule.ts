import { apiFetch } from './api';

export type RuleType = 'high_risk' | 'confirm' | 'capability_limit' | 'custom';
export type RuleAction = 'allow' | 'deny' | 'need_confirm' | 'mark_high_risk';
export type RuleStatus = 'enabled' | 'disabled';
export type RiskLevel = 'low' | 'medium' | 'high';
export type PolicyResult = 'allow' | 'deny' | 'need_confirm';

export interface RuleConditions {
  match?: 'all' | 'any';
  toolNames?: string[];
  toolNameContains?: string;
  riskLevels?: RiskLevel[];
  capabilities?: string[];
  needConfirmation?: boolean;
  permissionScopes?: string[];
}

export interface Rule {
  id: string;
  tenantId: string;
  name: string;
  type: RuleType;
  conditions: RuleConditions;
  action: RuleAction;
  priority: number;
  status: RuleStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleHit {
  id: string;
  ruleId: string | null;
  tenantId: string;
  ruleName: string;
  ruleType: RuleType;
  ruleAction: RuleAction;
  result: PolicyResult;
  toolName: string | null;
  capability: string | null;
  requestSummary: string | null;
  callerUserId: string | null;
  sessionId: string | null;
  taskId: string | null;
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateRuleInput {
  tenantId: string;
  name: string;
  type: RuleType;
  action: RuleAction;
  conditions?: RuleConditions;
  priority?: number;
  description?: string;
}

export type UpdateRuleInput = Partial<Omit<CreateRuleInput, 'tenantId'>>;

export interface MatchedRule {
  ruleId: string;
  name: string;
  type: RuleType;
  action: RuleAction;
  priority: number;
}

export interface PolicyDecision {
  allow: boolean;
  needConfirm: boolean;
  highRisk: boolean;
  result: PolicyResult;
  matchedRules: MatchedRule[];
  reason?: string;
}

export interface EvaluateInput {
  tenantId: string;
  toolName?: string;
  riskLevel?: RiskLevel;
  needConfirmation?: boolean;
  capability?: string;
  permissionScope?: string;
  userCapabilities?: string[];
  requestSummary?: string;
  sessionId?: string;
  taskId?: string;
  persistHits?: boolean;
}

type QueryParams = Record<string, string | number | undefined | null>;

const BASE = '/api/v1/rules';
const HITS_BASE = '/api/v1/rule-hits';

export function listRules(
  query: {
    tenantId?: string;
    type?: RuleType;
    action?: RuleAction;
    status?: RuleStatus;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<Rule>>(BASE, { query: query as QueryParams });
}

export function getRule(id: string) {
  return apiFetch<Rule>(`${BASE}/${id}`);
}

export function createRule(input: CreateRuleInput) {
  return apiFetch<Rule>(BASE, { method: 'POST', body: input });
}

export function updateRule(id: string, input: UpdateRuleInput) {
  return apiFetch<Rule>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateRuleStatus(id: string, status: RuleStatus) {
  return apiFetch<Rule>(`${BASE}/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function deleteRule(id: string) {
  return apiFetch<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}

export function evaluateRules(input: EvaluateInput) {
  return apiFetch<PolicyDecision>(`${BASE}/evaluate`, {
    method: 'POST',
    body: input,
  });
}

export function listRuleHits(
  query: {
    tenantId?: string;
    ruleId?: string;
    ruleType?: RuleType;
    sessionId?: string;
    taskId?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<RuleHit>>(HITS_BASE, { query: query as QueryParams });
}

// ── 展示元数据 ────────────────────────────────────────────

export const RULE_TYPE_META: Record<RuleType, { label: string; color: string }> = {
  high_risk: { label: '高风险识别（未测试）', color: 'volcano' },
  confirm: { label: '确认拦截', color: 'orange' },
  capability_limit: { label: '能力级限制（未测试）', color: 'geekblue' },
  custom: { label: '通用规则（未测试）', color: 'default' },
};

export const RULE_ACTION_META: Record<RuleAction, { label: string; color: string }> = {
  allow: { label: '放行', color: 'green' },
  deny: { label: '拦截', color: 'red' },
  need_confirm: { label: '需确认', color: 'orange' },
  mark_high_risk: { label: '标记高风险', color: 'volcano' },
};

export const RESULT_META: Record<PolicyResult, { label: string; color: string }> = {
  allow: { label: '放行', color: 'green' },
  deny: { label: '拦截', color: 'red' },
  need_confirm: { label: '需确认', color: 'orange' },
};

export const RISK_LEVEL_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

export const CAPABILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'qa', label: '问答型' },
  { value: 'query', label: '查询型' },
  { value: 'action', label: '操作型' },
  { value: 'workflow', label: '流程型' },
];
