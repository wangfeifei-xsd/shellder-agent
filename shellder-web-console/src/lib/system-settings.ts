import { apiFetch } from './api';

// ── 配置类型 ─────────────────────────────────────────

export interface ConfigEntry {
  configKey: string;
  configValue: string;
  description: string | null;
  updatedAt: string | null;
}

export type ConfigMap = Record<
  string,
  { configValue: string; description: string | null; updatedAt: string | null }
>;

export interface UpsertConfigInput {
  configKey: string;
  configValue: string;
  description?: string;
}

// ── 通知模板类型 ─────────────────────────────────────

export type NotificationTemplateType = 'approval' | 'task_complete' | 'exception';

export const TEMPLATE_TYPE_LABEL: Record<NotificationTemplateType, string> = {
  approval: '审批通知',
  task_complete: '任务完成通知',
  exception: '异常通知',
};

export interface NotificationTemplate {
  id: string;
  type: NotificationTemplateType;
  name: string;
  subject: string | null;
  body: string;
  enabled: boolean;
  connectorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  type: NotificationTemplateType;
  name: string;
  subject?: string;
  body: string;
  enabled?: boolean;
  connectorId?: string;
}

export interface UpdateTemplateInput {
  name?: string;
  subject?: string;
  body?: string;
  enabled?: boolean;
  connectorId?: string;
}

// ── API 调用 ─────────────────────────────────────────

const BASE = '/api/v1/system-settings';

export function getAllConfigs() {
  return apiFetch<ConfigMap>(`${BASE}/configs`);
}

export function getConfigsByGroup(group: string) {
  return apiFetch<ConfigEntry[]>(`${BASE}/configs/group/${group}`);
}

export function upsertConfig(input: UpsertConfigInput) {
  return apiFetch<unknown>(`${BASE}/configs`, { method: 'PUT', body: input });
}

export function batchUpsertConfigs(items: UpsertConfigInput[]) {
  return apiFetch<unknown>(`${BASE}/configs/batch`, {
    method: 'PUT',
    body: { items },
  });
}

export function listNotificationTemplates(type?: NotificationTemplateType) {
  return apiFetch<NotificationTemplate[]>(`${BASE}/notification-templates`, {
    query: { type } as Record<string, string>,
  });
}

export function getNotificationTemplate(id: string) {
  return apiFetch<NotificationTemplate>(`${BASE}/notification-templates/${id}`);
}

export function createNotificationTemplate(input: CreateTemplateInput) {
  return apiFetch<NotificationTemplate>(`${BASE}/notification-templates`, {
    method: 'POST',
    body: input,
  });
}

export function updateNotificationTemplate(id: string, input: UpdateTemplateInput) {
  return apiFetch<NotificationTemplate>(`${BASE}/notification-templates/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteNotificationTemplate(id: string) {
  return apiFetch<void>(`${BASE}/notification-templates/${id}`, {
    method: 'DELETE',
  });
}
