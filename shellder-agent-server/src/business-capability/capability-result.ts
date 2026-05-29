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

export interface WorkflowStepResult {
  seq: number;
  name: string;
  toolName?: string;
  status: 'completed' | 'failed' | 'skipped' | 'running' | 'pending';
  output?: unknown;
  durationMs?: number;
  error?: string;
}
