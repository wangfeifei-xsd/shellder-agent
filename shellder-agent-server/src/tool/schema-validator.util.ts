import Ajv, { ErrorObject } from 'ajv';

/**
 * JSON Schema 校验工具（阶段 07）。
 *
 * 两类用途：
 * 1. 保存 Tool 时校验 inputSchema / outputSchema 本身是否为合法 JSON Schema（验收标准 1）。
 * 2. 调用测试时按 inputSchema 校验入参、按 outputSchema 校验出参（执行计划 §4.4「schema 校验结果」）。
 *
 * 使用宽松模式（strict: false）以兼容常见 JSON Schema 写法；allErrors 收集全部错误供回显。
 */
const ajv = new Ajv({ allErrors: true, strict: false });

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/** 校验「某对象是否为合法 JSON Schema」。空 / 非对象视为非法。 */
export function assertValidJsonSchema(schema: unknown): SchemaValidationResult {
  if (schema === undefined || schema === null) {
    return { valid: false, errors: ['Schema 不能为空'] };
  }
  if (typeof schema !== 'object' || Array.isArray(schema)) {
    return { valid: false, errors: ['Schema 必须为 JSON 对象'] };
  }
  try {
    // compile 会对 schema 自身合法性做校验，非法（如 type 取值错误）将抛出
    ajv.compile(schema as object);
    return { valid: true, errors: [] };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/** 按给定 JSON Schema 校验数据，返回结构化结果（不抛出）。 */
export function validateAgainstSchema(
  schema: unknown,
  data: unknown,
): SchemaValidationResult {
  if (!schema || typeof schema !== 'object') {
    // 未定义 Schema → 视为不约束，校验通过
    return { valid: true, errors: [] };
  }
  try {
    const validate = ajv.compile(schema as object);
    const ok = validate(data);
    if (ok) return { valid: true, errors: [] };
    return { valid: false, errors: formatErrors(validate.errors) };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return ['数据不符合 Schema'];
  return errors.map((e) => {
    const path = e.instancePath || '(root)';
    return `${path} ${e.message ?? ''}`.trim();
  });
}
