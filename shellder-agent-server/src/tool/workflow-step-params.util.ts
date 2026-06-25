import { WorkflowStepParamBinding } from './tool.types';

/** 按 inputSchema 将数值等转为字符串，避免引用查询列类型不匹配 */
export function coerceWorkflowParams(
  inputSchema: unknown,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (!inputSchema || typeof inputSchema !== 'object') return params;
  const schema = inputSchema as {
    properties?: Record<string, { type?: string }>;
  };
  const out = { ...params };
  for (const [key, meta] of Object.entries(schema.properties ?? {})) {
    if (out[key] === undefined || out[key] === null) continue;
    const t = (meta.type ?? 'string').toLowerCase();
    if (t === 'string' && typeof out[key] !== 'string') {
      out[key] = String(out[key]);
    }
  }
  return out;
}

/** 从对象按路径取值，支持 `rows.0.company_name` 或 `rows[0].name` */
export function getValueByPath(obj: unknown, path: string): unknown {
  const normalized = path?.trim();
  if (!normalized) return obj;
  const parts = normalized.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** 解析 rows.0.company_name → company_name */
export function extractFieldFromRowsPath(path: string): string | null {
  const normalized = path.trim().replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'rows') return null;
  return parts[parts.length - 1] ?? null;
}

/**
 * 解析流程步骤入参绑定。
 * - fixed：固定值
 * - previous_step：引用前置步骤 output（fromStep 为 1-based，默认上一步）
 * - user_message：留空，由 http_query LLM 抽取补全
 */
export function resolveStepParamBindings(
  bindings: WorkflowStepParamBinding[] | undefined,
  previousStepOutputs: unknown[],
  currentStepIndex: number,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (!bindings?.length) return params;

  for (const binding of bindings) {
    const name = binding.paramName?.trim();
    if (!name) continue;

    switch (binding.source) {
      case 'fixed':
        if (binding.fixedValue !== undefined && binding.fixedValue !== '') {
          params[name] = binding.fixedValue;
        }
        break;
      case 'previous_step': {
        const targetIdx =
          binding.fromStep != null ? binding.fromStep - 1 : currentStepIndex - 1;
        if (targetIdx < 0 || targetIdx >= previousStepOutputs.length) break;
        const value = getValueByPath(
          previousStepOutputs[targetIdx],
          binding.valuePath ?? '',
        );
        if (value !== undefined && value !== null && value !== '') {
          params[name] = value;
        }
        break;
      }
      case 'user_message':
        break;
      default:
        break;
    }
  }

  return params;
}
