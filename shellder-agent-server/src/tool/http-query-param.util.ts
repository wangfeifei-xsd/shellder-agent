import { HttpQueryParameter } from './tool.types';
import { validateAgainstSchema } from './schema-validator.util';

/** 从 parameters 定义收集必填参数名 */
export function listRequiredHttpQueryParamNames(
  parameters: HttpQueryParameter[],
): string[] {
  return parameters.filter((p) => p.required && p.name?.trim()).map((p) => p.name.trim());
}

/** 入参是否已满足 parameters 必填项与 inputSchema */
export function httpQueryParamsSatisfied(
  params: Record<string, unknown>,
  parameters: HttpQueryParameter[],
  inputSchema: unknown,
): boolean {
  const requiredFromParams = listRequiredHttpQueryParamNames(parameters);
  for (const name of requiredFromParams) {
    const value = params[name];
    if (value === undefined || value === null || value === '') {
      return false;
    }
  }
  const schemaCheck = validateAgainstSchema(inputSchema, params);
  return schemaCheck.valid;
}

/** 合并入参：base 打底，overlay 覆盖非空值 */
export function mergeHttpQueryParams(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined || value === null || value === '') continue;
    merged[key] = value;
  }
  return merged;
}
