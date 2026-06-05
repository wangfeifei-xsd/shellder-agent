/**
 * Agent Runtime 类型定义（架构 §4.2 / §4.5 Agent Runtime）。
 *
 * SSE 事件类型：delta | tool_start | tool_end | confirm_required | done | error
 * 能力 Handler 接口：各类能力（qa/query/action/workflow）的统一执行契约。
 */

// ── SSE 事件 ────────────────────────────────────────────

export type SseEventType =
  | 'delta'
  | 'tool_start'
  | 'tool_end'
  | 'confirm_required'
  | 'done'
  | 'error';

export interface SseEvent {
  event: SseEventType;
  data: Record<string, unknown>;
}

export interface SseDeltaEvent extends SseEvent {
  event: 'delta';
  data: { text: string; seq?: number };
}

export interface SseToolStartEvent extends SseEvent {
  event: 'tool_start';
  data: { toolName: string; toolId?: string; input?: unknown };
}

export interface SseToolEndEvent extends SseEvent {
  event: 'tool_end';
  data: {
    toolName: string;
    toolId?: string;
    output?: unknown;
    durationMs?: number;
    status: 'success' | 'failed' | 'denied';
    error?: string;
  };
}

export interface SseConfirmRequiredEvent extends SseEvent {
  event: 'confirm_required';
  data: {
    toolName: string;
    toolId?: string;
    reason: string;
    messageId: string;
  };
}

export interface SseDoneEvent extends SseEvent {
  event: 'done';
  data: {
    messageId: string;
    capabilityType?: string;
    taskId?: string;
    summary?: string;
  };
}

export interface SseErrorEvent extends SseEvent {
  event: 'error';
  data: { code: string; message: string };
}

// ── Runtime 上下文 ────────────────────────────────────────

/** 嵌入主体：问数行级范围（Copilot Session 快照） */
export interface PrincipalContext {
  externalUserId?: string;
  scopeList?: string[];
}

export interface RuntimeContext {
  sessionId: string;
  tenantId: string;
  userId: string;
  username?: string;
  userMessage: string;
  capabilityType?: string;
  capabilityName?: string;
  routingReason?: string;
  routingCandidates?: unknown[];
  toolIds?: string[];
  needConfirmation?: boolean;
  /** 控制参数 */
  timeoutMs: number;
  maxRetries: number;
  /** Copilot 嵌入主体快照；管理端会话为空 */
  principalContext?: PrincipalContext;
}

// ── 能力 Handler 接口 ─────────────────────────────────────

/**
 * 能力 Handler 执行结果。
 *
 * output 字段遵循统一结果结构（验收标准 5）：
 * { capabilityType, data, citations?, steps?, status }
 */
export interface CapabilityHandlerResult {
  success: boolean;
  output?: unknown;
  error?: string;
  /** 执行过程产生的消息片段（用于 SSE delta 推送） */
  textChunks?: string[];
  /** 可选：覆盖 tool_call_audit 的 requestSummary（如 NL2SQL 生成 SQL） */
  auditRequestSummary?: string;
}

/**
 * 能力 Handler 统一接口（架构 §4.5 Agent Runtime / 执行计划 §4.1）。
 * Phase 13 填充各类型真实实现；Phase 12 提供 Mock 骨架。
 */
export interface CapabilityHandler {
  readonly type: string;
  execute(
    ctx: RuntimeContext,
    emitSse: (event: SseEvent) => void,
  ): Promise<CapabilityHandlerResult>;
}

// ── 发送消息模式 ──────────────────────────────────────────

export type SendMessageMode = 'sync' | 'stream';
