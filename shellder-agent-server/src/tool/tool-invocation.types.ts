import { PrincipalContext } from '../agent-runtime/agent-runtime.types';
import { PolicyDecision } from '../policy/policy.types';
import { SchemaValidationResult } from './schema-validator.util';

/** Tool 统一调用上下文 */
export interface InvokeContext {
  tenantId: string;
  userId: string;
  callerName?: string;
  principal?: PrincipalContext;
  source: 'admin_test' | 'runtime' | 'worker';
  /** Runtime 层已评估 Policy 时可跳过，避免重复 */
  skipPolicy?: boolean;
  sessionId?: string;
  /** Policy 评估用请求摘要 */
  requestSummary?: string;
}

/** Tool 统一调用结果（与 ToolTestResult 字段对齐） */
export interface ToolInvokeResult {
  policy: PolicyDecision;
  inputValidation: SchemaValidationResult;
  outputValidation?: SchemaValidationResult;
  executed: boolean;
  status: 'success' | 'failed' | 'denied' | 'need_confirm' | 'skipped';
  rawRequest?: unknown;
  rawResponse?: unknown;
  transformedResult?: unknown;
  responseType?: 'text_reply' | 'json_data' | 'play_audio';
  durationMs: number;
  message: string;
}
