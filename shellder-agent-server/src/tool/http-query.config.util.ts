import { HttpQueryParameter, HttpQueryToolConfig, HttpToolConfig } from './tool.types';
import { ResponseMappingConfig } from './invoke/response-mapper.util';

/** 将 httpQuery.invoke 转为 HttpToolInvoker 可消费的 HTTP 配置 */
export function httpQueryToHttpConfig(hq: HttpQueryToolConfig): HttpToolConfig {
  return {
    method: hq.invoke.method,
    path: hq.invoke.path,
    queryMapping: hq.invoke.queryMapping,
    bodyMapping: hq.invoke.bodyMapping,
  };
}

export function httpQueryToResponseMapping(hq: HttpQueryToolConfig): ResponseMappingConfig {
  return hq.response;
}

/** 由 parameters[] 生成 JSON Schema（保存时可与 inputSchema 双向校验） */
export function parametersToInputSchema(
  parameters: HttpQueryParameter[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of parameters) {
    properties[p.name] = {
      type: p.type || 'string',
      ...(p.description ? { description: p.description } : {}),
    };
    if (p.required) required.push(p.name);
  }
  return { type: 'object', properties, required };
}

const TOOL_CODE_RE = /^[a-z][a-z0-9_]*$/;

export function assertValidToolCode(toolCode: string): void {
  if (!TOOL_CODE_RE.test(toolCode)) {
    throw new Error('toolCode 须匹配 [a-z][a-z0-9_]*，如 music_search_v1');
  }
}
