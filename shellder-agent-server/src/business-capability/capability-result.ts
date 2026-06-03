/**
 * 统一结果结构（执行计划验收标准 5）：
 * { capabilityType, data, citations?, steps?, status }
 */
export interface CapabilityResult {
  capabilityType: 'qa' | 'query' | 'action' | 'workflow';
  data: unknown;
  citations?: Citation[];
  steps?: WorkflowStepResult[];
  status: 'success' | 'failed' | 'partial' | 'pending_confirm';
  error?: string;
}

export interface Citation {
  documentId?: string;
  documentTitle?: string;
  chunkId?: string;
  content: string;
  score?: number;
}

/** 问答型 data 扩展字段（与 wiki dialogue/recall、知识库测试页一致） */
export interface QaCapabilityData {
  text?: string;
  merged_media?: { code: string; title?: string | null }[];
  injected_context?: string;
  recall_method?: string;
}

export interface WorkflowStepResult {
  seq: number;
  name: string;
  toolName?: string;
  status: 'completed' | 'failed' | 'skipped' | 'running' | 'pending';
  output?: unknown;
  durationMs?: number;
  error?: string;
}
