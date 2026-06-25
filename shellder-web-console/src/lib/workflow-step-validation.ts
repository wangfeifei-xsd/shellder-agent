import { ErColumn } from '@/lib/connector';
import {
  Tool,
  ToolInputParamDef,
  WorkflowStepDef,
  WorkflowStepParamBinding,
  listToolInputParams,
} from '@/lib/tool';

export interface ErColumnRef {
  table: string;
  column: ErColumn;
}

export interface WorkflowValidationContext {
  toolsById: Map<string, Tool>;
  /** connectorId → 已发布 ER 列 */
  erColumnsByConnector: Map<string, ErColumnRef[]>;
}

/** 从已发布 ER 提取全部列 */
export function collectErColumns(
  tables: Array<{ name: string; columns: ErColumn[] }> | undefined,
): ErColumnRef[] {
  if (!tables?.length) return [];
  return tables.flatMap((t) =>
    (t.columns ?? []).map((column) => ({ table: t.name, column })),
  );
}

function normalizeType(type: string | undefined): string {
  return (type || 'string').toLowerCase();
}

/** ER / SQL 列类型是否可安全映射为参数类型 */
export function isErColumnCompatibleWithParam(
  columnType: string,
  paramType: string,
): boolean {
  const col = columnType.toLowerCase();
  const param = normalizeType(paramType);
  if (param === 'string') {
    const numericOnly =
      col.includes('int') ||
      col.includes('decimal') ||
      col.includes('numeric') ||
      col.includes('float') ||
      col.includes('double') ||
      col.includes('real') ||
      col === 'bit';
    return !numericOnly;
  }
  if (param === 'number' || param === 'integer') {
    return (
      col.includes('int') ||
      col.includes('decimal') ||
      col.includes('numeric') ||
      col.includes('float') ||
      col.includes('double') ||
      col.includes('real')
    );
  }
  if (param === 'boolean') {
    return col.includes('bool') || col.includes('bit');
  }
  return true;
}

function isFixedValueCompatible(value: string, paramType: string): boolean {
  const param = normalizeType(paramType);
  if (param === 'number' || param === 'integer') {
    return value !== '' && !Number.isNaN(Number(value));
  }
  if (param === 'boolean') {
    return value === 'true' || value === 'false';
  }
  return value.trim().length > 0;
}

/** 解析 rows.0.company_name → company_name */
export function extractFieldFromRowsPath(path: string): string | null {
  const normalized = path.trim().replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'rows') return null;
  return parts[parts.length - 1] ?? null;
}

/** 查询型步骤 output 可引用路径 */
export function buildQueryStepPathOptions(
  erColumns: ErColumnRef[],
): { value: string; label: string }[] {
  return erColumns.map(({ table, column }) => ({
    value: `rows.0.${column.name}`,
    label: `${column.name}（${table} · ${column.type}）`,
  }));
}

/** http_query 步骤 output 可引用路径（fieldMapping 键） */
export function buildHttpQueryStepPathOptions(tool: Tool): { value: string; label: string }[] {
  const mapping = tool.config.httpQuery?.response?.fieldMapping;
  if (!mapping) {
    return [{ value: 'data', label: 'data（完整响应体）' }];
  }
  return Object.keys(mapping).map((key) => ({
    value: `data.${key}`,
    label: `${key} → ${mapping[key]}`,
  }));
}

function getPriorStepOutputPathOptions(
  priorTool: Tool,
  erColumnsByConnector: Map<string, ErColumnRef[]>,
): { value: string; label: string }[] {
  switch (priorTool.type) {
    case 'query': {
      const cols = priorTool.connectorId
        ? erColumnsByConnector.get(priorTool.connectorId) ?? []
        : [];
      return buildQueryStepPathOptions(cols);
    }
    case 'http_query':
      return buildHttpQueryStepPathOptions(priorTool);
    case 'action':
    case 'notification':
      return [
        { value: 'data', label: 'data（响应体）' },
        { value: 'status', label: 'status（HTTP 状态码）' },
      ];
    default:
      return [];
  }
}

function validatePreviousStepPath(
  path: string,
  param: ToolInputParamDef,
  priorTool: Tool,
  erColumnsByConnector: Map<string, ErColumnRef[]>,
): string | null {
  const trimmed = path.trim();
  if (!trimmed) return '未填写结果路径';

  if (priorTool.type === 'query') {
    const field = extractFieldFromRowsPath(trimmed);
    if (!field) {
      return '查询型步骤结果路径须为 rows.0.列名 格式，例如 rows.0.company_name';
    }
    if (!priorTool.connectorId) {
      return '前置查询工具未关联连接器，无法校验列名';
    }
    const cols = erColumnsByConnector.get(priorTool.connectorId);
    if (!cols?.length) {
      return '前置查询工具关联的连接器尚无已发布 ER，请先在「库表 ER 图」发布后再引用';
    }
    const matched = cols.find(
      (c) => c.column.name.toLowerCase() === field.toLowerCase(),
    );
    if (!matched) {
      const available = cols.map((c) => c.column.name).slice(0, 8).join('、');
      return `路径列「${field}」不在前置步骤 ER 中（可用列示例：${available}${cols.length > 8 ? '…' : ''}）`;
    }
    if (!isErColumnCompatibleWithParam(matched.column.type, param.type)) {
      return `列「${field}」类型为 ${matched.column.type}，与参数 ${param.name}（${param.type}）不兼容，请选择字符串列或使用固定值/问句提取`;
    }
    return null;
  }

  if (priorTool.type === 'http_query') {
    const options = buildHttpQueryStepPathOptions(priorTool);
    const allowed = new Set(options.map((o) => o.value));
    if (!allowed.has(trimmed) && !trimmed.startsWith('data.')) {
      return `路径须为 ${[...allowed].join(' 或 ')} 之一`;
    }
    return null;
  }

  if (priorTool.type === 'action' || priorTool.type === 'notification') {
    if (!trimmed.startsWith('data') && trimmed !== 'status') {
      return '操作型步骤结果路径须以 data 或 status 开头';
    }
    return null;
  }

  return `前置步骤工具类型「${priorTool.type}」不支持结果被引用`;
}

function validateBinding(
  stepIndex: number,
  step: WorkflowStepDef,
  param: ToolInputParamDef,
  binding: WorkflowStepParamBinding | undefined,
  steps: WorkflowStepDef[],
  ctx: WorkflowValidationContext,
): string | null {
  const stepNo = stepIndex + 1;
  const source = binding?.source ?? 'user_message';

  if (source === 'fixed') {
    if (!binding?.fixedValue?.trim()) {
      return `步骤 ${stepNo}「${step.name}」：参数 ${param.name} 选择了固定值但未填写`;
    }
    if (!isFixedValueCompatible(binding.fixedValue, param.type)) {
      return `步骤 ${stepNo}「${step.name}」：参数 ${param.name} 固定值与类型 ${param.type} 不匹配`;
    }
    return null;
  }

  if (source === 'previous_step') {
    const refStepNo = binding?.fromStep ?? stepIndex;
    const refIndex = refStepNo - 1;

    if (refIndex < 0 || refIndex >= stepIndex) {
      return `步骤 ${stepNo}「${step.name}」：参数 ${param.name} 只能引用当前步骤之前的步骤（步骤 1～${stepIndex}）`;
    }

    const priorStep = steps[refIndex];
    const priorTool = priorStep?.toolId ? ctx.toolsById.get(priorStep.toolId) : undefined;
    if (!priorTool) {
      return `步骤 ${stepNo}「${step.name}」：参数 ${param.name} 引用的步骤 ${refStepNo} 未配置工具`;
    }

    const pathError = validatePreviousStepPath(
      binding?.valuePath ?? '',
      param,
      priorTool,
      ctx.erColumnsByConnector,
    );
    if (pathError) {
      return `步骤 ${stepNo}「${step.name}」：参数 ${param.name} ${pathError}`;
    }
    return null;
  }

  if (param.required && source === 'user_message') {
    return null;
  }

  return null;
}

/** 校验流程全部步骤入参绑定；返回可读错误列表 */
export function validateWorkflowSteps(
  steps: WorkflowStepDef[] | undefined,
  ctx: WorkflowValidationContext,
): string[] {
  if (!steps?.length) return ['请至少添加一个流程步骤'];

  const errors: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.toolId) {
      errors.push(`步骤 ${i + 1}：未选择调用工具`);
      continue;
    }
    const tool = ctx.toolsById.get(step.toolId);
    if (!tool) {
      errors.push(`步骤 ${i + 1}：工具不存在或已删除`);
      continue;
    }

    const paramDefs = listToolInputParams(tool);
    const bindings = step.paramBindings ?? [];

    for (const param of paramDefs) {
      const binding = bindings.find((b) => b.paramName === param.name);
      const err = validateBinding(i, step, param, binding, steps, ctx);
      if (err) errors.push(err);
    }
  }

  return errors;
}

export function getPathOptionsForPriorStep(
  priorStepIndex: number,
  steps: WorkflowStepDef[],
  ctx: WorkflowValidationContext,
): { value: string; label: string }[] {
  const priorStep = steps[priorStepIndex];
  if (!priorStep?.toolId) return [];
  const priorTool = ctx.toolsById.get(priorStep.toolId);
  if (!priorTool) return [];
  return getPriorStepOutputPathOptions(priorTool, ctx.erColumnsByConnector);
}

/** 保存前异步校验（拉取工具与 ER） */
export async function validateWorkflowStepsForTenant(
  tenantId: string,
  steps: WorkflowStepDef[] | undefined,
): Promise<string[]> {
  const { fetchAllTools } = await import('@/lib/tool');
  const { getConnectorErDiagram } = await import('@/lib/connector');
  const tools = await fetchAllTools({ tenantId });
  const toolsById = new Map(tools.map((t) => [t.id, t]));
  const erColumnsByConnector = new Map<string, ErColumnRef[]>();

  const connectorIds = new Set<string>();
  for (const step of steps ?? []) {
    if (!step.toolId) continue;
    const t = toolsById.get(step.toolId);
    if (t?.type === 'query' && t.connectorId) connectorIds.add(t.connectorId);
    if (step.paramBindings) {
      for (const b of step.paramBindings) {
        if (b.source !== 'previous_step') continue;
        const refIdx = (b.fromStep ?? 0) - 1;
        const prior = steps?.[refIdx];
        if (!prior?.toolId) continue;
        const pt = toolsById.get(prior.toolId);
        if (pt?.type === 'query' && pt.connectorId) connectorIds.add(pt.connectorId);
      }
    }
  }

  await Promise.all(
    [...connectorIds].map(async (connectorId) => {
      try {
        const er = await getConnectorErDiagram(connectorId);
        erColumnsByConnector.set(connectorId, collectErColumns(er.published?.tables));
      } catch {
        erColumnsByConnector.set(connectorId, []);
      }
    }),
  );

  return validateWorkflowSteps(steps, { toolsById, erColumnsByConnector });
}
