import { ToolType } from '@prisma/client';

/**
 * tool.config 的内部归一化结构（按 Tool 类型使用对应子配置）。
 * - query        → sql：SQL 查询工具配置（表黑名单 / 行数 / 时长 / 模板；只读由执行层强制）。
 * - action / notification → http：HTTP 调用配置（方法 / 路径 / 附加头 / 体模板）。
 * - workflow     → workflow：步骤编排（编排执行见 12/13）。
 */
export interface ToolConfig {
  sql?: SqlToolConfig;
  http?: HttpToolConfig;
  workflow?: WorkflowToolConfig;
}

/** SQL 查询工具配置（执行计划 §4.5） */
export interface SqlToolConfig {
  /** 禁止访问的表黑名单（命中则拒绝；空数组表示不限制表，仅受只读约束） */
  tableBlacklist: string[];
  /** 禁止访问的字段黑名单（格式 table.field 或 field；空数组表示不限制字段） */
  fieldBlacklist: string[];
  /** 最大返回行数（超出拒绝） */
  maxRows: number;
  /** 最大执行时长（毫秒，超时拒绝） */
  maxExecutionMs: number;
  /** SQL 模板（SQL 模板管理） */
  templates: SqlTemplate[];
}

export interface SqlTemplate {
  id: string;
  name: string;
  sql: string;
  description?: string;
}

/** HTTP 调用配置（action / notification 型） */
export interface HttpToolConfig {
  /** HTTP 方法 */
  method: string;
  /** 相对连接器 target 的路径 */
  path: string;
  /** 附加请求头（非敏感；认证头由连接器凭证注入） */
  headers?: Record<string, string>;
  /** 可选请求体模板 */
  bodyTemplate?: unknown;
}

/** 流程型步骤编排 */
export interface WorkflowToolConfig {
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  /** 引用的子 Tool id（按需） */
  toolId?: string;
  description?: string;
}

export const EMPTY_TOOL_CONFIG: ToolConfig = {};

export const DEFAULT_SQL_CONFIG: SqlToolConfig = {
  tableBlacklist: [],
  fieldBlacklist: [],
  maxRows: 100,
  maxExecutionMs: 3000,
  templates: [],
};

/** 历史 config.sql 可能仍含表白名单字段（读取兼容，保存时归一为黑名单） */
export type LegacySqlToolConfig = SqlToolConfig & {
  tableWhitelist?: string[];
  fieldWhitelist?: string[];
};

export const TOOL_TYPE_LABEL: Record<ToolType, string> = {
  query: '查询型',
  action: '操作型',
  workflow: '流程型',
  notification: '通知型',
};

/** Tool 类型 → 业务能力（Policy 评估 capability / 能力级限制） */
export const TOOL_TYPE_CAPABILITY: Record<ToolType, string> = {
  query: 'query',
  action: 'action',
  workflow: 'workflow',
  notification: 'action',
};

/** Tool 类型 → 期望的连接器类型（绑定校验；workflow 不强制连接器） */
export const TOOL_TYPE_CONNECTOR_TYPE: Record<ToolType, string | null> = {
  query: 'db_readonly',
  action: 'http',
  notification: 'notification',
  workflow: null,
};
