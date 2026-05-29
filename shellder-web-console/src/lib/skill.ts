import { apiFetch } from './api';

export type SkillStatus = 'draft' | 'enabled' | 'disabled';
export type SkillRiskLevel = 'low' | 'medium' | 'high';
export type CapabilityType = 'qa' | 'query' | 'action' | 'workflow';
export type SkillEntryMode = 'tool' | 'workflow';
export type SkillExecStatus = 'success' | 'failed' | 'running' | 'timeout';

export interface SkillTrigger {
  id: string;
  skillId: string;
  triggerText: string;
  triggerType: string;
  priority: number;
}

export interface SkillBinding {
  id: string;
  skillId: string;
  bindingType: string;
  targetId: string;
  orderNo: number;
  config: Record<string, unknown> | null;
}

export interface Skill {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  capabilityType: CapabilityType;
  status: SkillStatus;
  version: number;
  riskLevel: SkillRiskLevel;
  needConfirmation: boolean;
  permissionScope: string | null;
  entryMode: SkillEntryMode;
  entryToolId: string | null;
  workflowToolId: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  preconditions: Record<string, unknown> | null;
  resultTemplate: string | null;
  missingParamStrategy: Record<string, unknown> | null;
  failureHint: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  triggers: SkillTrigger[];
  bindings: SkillBinding[];
  lastCalledAt?: string | null;
}

export interface ToolRef {
  id: string;
  name: string;
  type: string;
  status: string;
}

export interface SkillStats {
  sampleSize: number;
  successRate: number;
  failureRate: number;
  avgDurationMs: number | null;
}

export interface SkillExecution {
  id: string;
  skillId: string;
  sessionId: string | null;
  taskId: string | null;
  tenantId: string;
  userId: string | null;
  status: SkillExecStatus;
  inputSnapshot: Record<string, unknown> | null;
  outputSnapshot: Record<string, unknown> | null;
  errorSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SkillDetail extends Skill {
  entryTool: ToolRef | null;
  workflowTool: ToolRef | null;
  stats: SkillStats;
  recentExecutions: SkillExecution[];
}

export interface TriggerTestCandidate {
  skillId: string;
  skillName: string;
  skillCode: string;
  capabilityType: CapabilityType;
  score: number;
  reason: string;
  matchedTrigger: { text: string; type: string } | null;
}

export interface TriggerTestResult {
  inputText: string;
  capabilityTypeFilter: string | null;
  candidateCount: number;
  candidates: TriggerTestCandidate[];
  hitSkill: {
    id: string;
    name: string;
    code: string;
    capabilityType: CapabilityType;
    entryMode: SkillEntryMode;
    reason: string;
  } | null;
  entryTool: ToolRef | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateSkillInput {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  capabilityType: CapabilityType;
  status?: SkillStatus;
  riskLevel?: SkillRiskLevel;
  needConfirmation?: boolean;
  permissionScope?: string;
  entryMode: SkillEntryMode;
  entryToolId?: string;
  workflowToolId?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  preconditions?: Record<string, unknown>;
  resultTemplate?: string;
  missingParamStrategy?: Record<string, unknown>;
  failureHint?: string;
  remark?: string;
  triggers?: { triggerText: string; triggerType?: string; priority?: number }[];
  bindings?: { bindingType: string; targetId: string; orderNo?: number; config?: Record<string, unknown> }[];
}

export type UpdateSkillInput = Partial<Omit<CreateSkillInput, 'tenantId'>>;

type QueryParams = Record<string, string | number | undefined | null>;

const BASE = '/api/v1/skills';

export function listSkills(
  query: {
    tenantId?: string;
    capabilityType?: CapabilityType;
    category?: string;
    status?: SkillStatus;
    riskLevel?: SkillRiskLevel;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<Skill>>(BASE, { query: query as QueryParams });
}

export function getSkill(id: string) {
  return apiFetch<SkillDetail>(`${BASE}/${id}`);
}

export function createSkill(input: CreateSkillInput) {
  return apiFetch<Skill>(BASE, { method: 'POST', body: input });
}

export function updateSkill(id: string, input: UpdateSkillInput) {
  return apiFetch<Skill>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function updateSkillStatus(id: string, status: SkillStatus) {
  return apiFetch<Skill>(`${BASE}/${id}/status`, { method: 'PATCH', body: { status } });
}

export function deleteSkill(id: string) {
  return apiFetch<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}

export function testSkillTrigger(input: { tenantId: string; text: string; capabilityType?: string }) {
  return apiFetch<TriggerTestResult>(`${BASE}/test`, { method: 'POST', body: input });
}

export function getSkillExecutions(
  skillId: string,
  query: {
    tenantId?: string;
    userId?: string;
    status?: SkillExecStatus;
    startFrom?: string;
    startTo?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<SkillExecution>>(`${BASE}/${skillId}/executions`, {
    query: query as QueryParams,
  });
}

// ── 展示元数据 ────────────────────────────────────────────

export const CAPABILITY_TYPE_META: Record<CapabilityType, { label: string; color: string }> = {
  qa: { label: '问答型', color: 'blue' },
  query: { label: '查询型', color: 'geekblue' },
  action: { label: '操作型', color: 'volcano' },
  workflow: { label: '流程型', color: 'purple' },
};

export const CAPABILITY_TYPE_OPTIONS = (
  Object.entries(CAPABILITY_TYPE_META) as [CapabilityType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const SKILL_STATUS_META: Record<SkillStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  enabled: { label: '启用', color: 'green' },
  disabled: { label: '停用', color: 'red' },
};

export const SKILL_STATUS_OPTIONS = (
  Object.entries(SKILL_STATUS_META) as [SkillStatus, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const RISK_LEVEL_META: Record<SkillRiskLevel, { label: string; color: string }> = {
  low: { label: '低', color: 'green' },
  medium: { label: '中', color: 'gold' },
  high: { label: '高', color: 'red' },
};

export const RISK_LEVEL_OPTIONS = (
  Object.entries(RISK_LEVEL_META) as [SkillRiskLevel, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const ENTRY_MODE_META: Record<SkillEntryMode, { label: string }> = {
  tool: { label: '主 Tool' },
  workflow: { label: 'Workflow Tool' },
};

export const ENTRY_MODE_OPTIONS = (
  Object.entries(ENTRY_MODE_META) as [SkillEntryMode, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const TRIGGER_TYPE_OPTIONS = [
  { value: 'keyword', label: '关键词' },
  { value: 'intent', label: '意图' },
  { value: 'regex', label: '正则' },
];

export const EXEC_STATUS_META: Record<SkillExecStatus, { label: string; color: string }> = {
  success: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' },
  running: { label: '执行中', color: 'blue' },
  timeout: { label: '超时', color: 'orange' },
};
