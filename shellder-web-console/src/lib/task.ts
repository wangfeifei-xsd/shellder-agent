import { apiFetch } from './api';

// ── 类型定义 ─────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
export type TaskType = 'sync' | 'async' | 'scheduled';
export type CapabilityType = 'qa' | 'query' | 'action' | 'workflow';
export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type TaskLogLevel = 'info' | 'warn' | 'error';
export type TaskLogType =
  | 'state_change'
  | 'tool_call'
  | 'error'
  | 'confirmation'
  | 'notification'
  | 'retry'
  | 'custom';

export interface TaskItem {
  id: string;
  tenantId: string;
  sessionId: string | null;
  userId: string | null;
  title: string | null;
  type: TaskType;
  status: TaskStatus;
  capabilityType: CapabilityType | null;
  currentNode: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  failReason: string | null;
  jobId: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStepItem {
  id: string;
  taskId: string;
  seq: number;
  name: string;
  description: string | null;
  status: TaskStepStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  toolName: string | null;
  failReason: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLogItem {
  id: string;
  taskId: string;
  stepId: string | null;
  type: TaskLogType;
  level: TaskLogLevel;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskDetail extends TaskItem {
  steps: TaskStepItem[];
}

export interface TaskProgress {
  task: TaskItem;
  totalSteps: number;
  completedCount: number;
  currentStep: TaskStepItem | null;
  remainingCount: number;
  steps: TaskStepItem[];
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 展示元数据 ────────────────────────────────────────────

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: '待执行', color: 'default' },
  running: { label: '执行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
  timeout: { label: '超时', color: 'error' },
};

export const TASK_STATUS_OPTIONS = (
  Object.entries(TASK_STATUS_META) as [TaskStatus, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const TASK_TYPE_META: Record<TaskType, { label: string; color: string }> = {
  sync: { label: '同步', color: 'blue' },
  async: { label: '异步', color: 'purple' },
  scheduled: { label: '定时', color: 'cyan' },
};

export const TASK_TYPE_OPTIONS = (
  Object.entries(TASK_TYPE_META) as [TaskType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const CAPABILITY_TYPE_META: Record<CapabilityType, { label: string; color: string }> = {
  qa: { label: '问答型', color: 'cyan' },
  query: { label: '查询型', color: 'geekblue' },
  action: { label: '操作型', color: 'orange' },
  workflow: { label: '流程型', color: 'purple' },
};

export const CAPABILITY_TYPE_OPTIONS = (
  Object.entries(CAPABILITY_TYPE_META) as [CapabilityType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export const STEP_STATUS_META: Record<TaskStepStatus, { label: string; color: string }> = {
  pending: { label: '待执行', color: 'default' },
  running: { label: '执行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  skipped: { label: '已跳过', color: 'warning' },
};

export const LOG_LEVEL_META: Record<TaskLogLevel, { label: string; color: string }> = {
  info: { label: '信息', color: 'blue' },
  warn: { label: '警告', color: 'orange' },
  error: { label: '错误', color: 'red' },
};

export const LOG_TYPE_META: Record<TaskLogType, { label: string; color: string }> = {
  state_change: { label: '状态变更', color: 'blue' },
  tool_call: { label: '工具调用', color: 'purple' },
  error: { label: '异常', color: 'red' },
  confirmation: { label: '人工确认', color: 'orange' },
  notification: { label: '异步通知', color: 'cyan' },
  retry: { label: '重试', color: 'gold' },
  custom: { label: '自定义', color: 'default' },
};

export const LOG_TYPE_OPTIONS = (
  Object.entries(LOG_TYPE_META) as [TaskLogType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

// ── API 客户端 ────────────────────────────────────────────

const BASE = '/api/v1/tasks';

type QueryParams = Record<string, string | number | undefined | null>;

export function listTasks(
  query: {
    tenantId?: string;
    userId?: string;
    sessionId?: string;
    type?: TaskType;
    status?: TaskStatus;
    capabilityType?: CapabilityType;
    startTime?: string;
    endTime?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<TaskItem>>(BASE, { query: query as QueryParams });
}

export function getTask(id: string) {
  return apiFetch<TaskDetail>(`${BASE}/${id}`);
}

export function getTaskProgress(id: string) {
  return apiFetch<TaskProgress>(`${BASE}/${id}/progress`);
}

export function getTaskLogs(
  taskId: string,
  query: {
    type?: TaskLogType;
    level?: TaskLogLevel;
    stepId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return apiFetch<PagedResult<TaskLogItem>>(`${BASE}/${taskId}/logs`, {
    query: query as QueryParams,
  });
}
