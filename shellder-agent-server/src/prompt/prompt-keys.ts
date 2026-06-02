/**
 * 全平台 Prompt 逻辑键注册表（V1 最小集，方案 §13）
 * 新增 key 须同步管理后台与 project-sql/21-prompt-management/seed.sql
 */
export const PROMPT_KEYS = {
  /** 问答生成 system（含引用与注入上下文占位） */
  QA_DIALOGUE_SYSTEM: 'qa.dialogue.system',
  /** NL2SQL system */
  QUERY_NL2SQL_SYSTEM: 'query.nl2sql.system',
  /** NL2SQL user 骨架 */
  QUERY_NL2SQL_USER: 'query.nl2sql.user',
  /** 查询结果解读 system */
  QUERY_RESULT_SYSTEM: 'query.result.system',
  /** 查询结果解读 user 骨架 */
  QUERY_RESULT_USER: 'query.result.user',
  /** ER 初版构图 system */
  CONNECTOR_ER_DIAGRAM_SYSTEM: 'connector.er_diagram.system',
  /** ER 基于 draft 优化 system */
  CONNECTOR_ER_DIAGRAM_REFINE_SYSTEM: 'connector.er_diagram.refine.system',
  /** ER user 消息骨架 */
  CONNECTOR_ER_DIAGRAM_USER: 'connector.er_diagram.user',
} as const;

export type PromptKey = (typeof PROMPT_KEYS)[keyof typeof PROMPT_KEYS];

export const PROMPT_KEY_LIST: PromptKey[] = Object.values(PROMPT_KEYS);
