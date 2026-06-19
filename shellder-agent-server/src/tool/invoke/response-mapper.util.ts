/** 响应映射配置（Phase 2 httpQuery.response / Phase 3 action responseMapping 共用） */
export interface ResponseMappingConfig {
  type?: 'text_reply' | 'json_data' | 'play_audio';
  successPath?: string;
  successValue?: string | number;
  fieldMapping?: Record<string, string>;
  replyTextPath?: string;
}

export interface MappedResponse {
  success: boolean;
  transformedResult: unknown;
  responseType?: 'text_reply' | 'json_data' | 'play_audio';
  replyText?: string;
  message?: string;
}

/**
 * 将 HTTP 原始响应映射为归一化出参。
 * Phase 1：无 mapping 配置时直接透传 parsed body；HTTP 2xx/3xx 由 Invoker 判定。
 */
export class ResponseMapper {
  map(
    httpOk: boolean,
    parsedBody: unknown,
    config?: ResponseMappingConfig,
  ): MappedResponse {
    if (!config || (!config.successPath && !config.fieldMapping && !config.replyTextPath)) {
      return {
        success: httpOk,
        transformedResult: parsedBody,
        responseType: config?.type ?? 'json_data',
      };
    }

    const businessSuccess = config.successPath
      ? this.evaluateSuccess(parsedBody, config.successPath, config.successValue)
      : httpOk;

    let transformed: unknown = parsedBody;
    if (config.fieldMapping && Object.keys(config.fieldMapping).length > 0) {
      transformed = this.applyFieldMapping(parsedBody, config.fieldMapping);
    }

    const replyText = config.replyTextPath
      ? String(this.getByPath(parsedBody, config.replyTextPath) ?? '')
      : undefined;

    return {
      success: httpOk && businessSuccess,
      transformedResult: transformed,
      responseType: config.type ?? 'json_data',
      replyText,
      message: businessSuccess ? undefined : '业务响应 success 判定未通过',
    };
  }

  private evaluateSuccess(
    data: unknown,
    path: string,
    expected?: string | number,
  ): boolean {
    const actual = this.getByPath(data, path);
    if (expected === undefined) {
      return Boolean(actual);
    }
    return actual === expected || String(actual) === String(expected);
  }

  private applyFieldMapping(
    data: unknown,
    mapping: Record<string, string>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [targetKey, sourcePath] of Object.entries(mapping)) {
      out[targetKey] = this.getByPath(data, sourcePath);
    }
    return out;
  }

  /** 简单 JsonPath：支持 $.a.b 或 a.b 形式 */
  getByPath(data: unknown, path: string): unknown {
    if (data === null || data === undefined) return undefined;
    const normalized = path.startsWith('$.') ? path.slice(2) : path.replace(/^\$\.?/, '');
    if (!normalized) return data;

    let current: unknown = data;
    for (const segment of normalized.split('.')) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
}
