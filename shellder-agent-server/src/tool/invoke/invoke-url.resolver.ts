import { Connector } from '@prisma/client';
import { HttpToolConfig } from '../tool.types';
import { InvokeContext } from '../tool-invocation.types';
import { buildAuthHeaders, joinUrl } from './http-auth.util';

export interface ResolvedHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** 用于审计/回显的请求体对象 */
  body?: unknown;
  /** fetch 用序列化后的 body；GET/HEAD 为 undefined */
  bodyString?: string;
}

/**
 * 解析 HTTP Tool 调用 URL、头与 body。
 * Phase 1：兼容 legacy `bodyTemplate`；queryMapping/bodyMapping 在 Phase 2/3 扩展。
 */
export class InvokeUrlResolver {
  resolve(
    connector: Connector,
    http: HttpToolConfig,
    params: Record<string, unknown>,
    ctx: InvokeContext,
    timeoutMs: number,
  ): ResolvedHttpRequest {
    void timeoutMs;
    void ctx;

    const baseUrl = joinUrl(connector.target, http.path);
    const url = this.appendQueryParams(baseUrl, http, params, ctx);
    const method = (http.method || 'POST').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(connector),
      ...(http.headers ?? {}),
    };

    const hasBody = method !== 'GET' && method !== 'HEAD';
    let body: unknown;
    let bodyString: string | undefined;

    if (hasBody) {
      body = this.resolveBody(http, params, ctx);
      bodyString = JSON.stringify(body);
    }

    return { method, url, headers, body, bodyString };
  }

  private resolveBody(
    http: HttpToolConfig,
    params: Record<string, unknown>,
    ctx: InvokeContext,
  ): unknown {
    if (http.bodyMapping && Object.keys(http.bodyMapping).length > 0) {
      return this.applyMapping(http.bodyMapping, params, ctx);
    }
    // legacy：bodyTemplate 优先，否则使用入参
    if (http.bodyTemplate !== undefined && http.bodyTemplate !== null) {
      return http.bodyTemplate;
    }
    return params;
  }

  /** 映射规则："paramName" 取自入参；"$context.xxx" 取自 InvokeContext */
  applyMapping(
    mapping: Record<string, string>,
    params: Record<string, unknown>,
    ctx: InvokeContext,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [targetKey, sourceExpr] of Object.entries(mapping)) {
      out[targetKey] = this.resolveMappingValue(sourceExpr, params, ctx);
    }
    return out;
  }

  private resolveMappingValue(
    expr: string,
    params: Record<string, unknown>,
    ctx: InvokeContext,
  ): unknown {
    if (expr.startsWith('$context.')) {
      const key = expr.slice('$context.'.length);
      switch (key) {
        case 'tenantId':
          return ctx.tenantId;
        case 'userId':
          return ctx.userId;
        case 'callerName':
          return ctx.callerName;
        case 'sessionId':
          return ctx.sessionId;
        default:
          return undefined;
      }
    }
    return params[expr];
  }

  private appendQueryParams(
    url: string,
    http: HttpToolConfig,
    params: Record<string, unknown>,
    ctx: InvokeContext,
  ): string {
    if (!http.queryMapping || Object.keys(http.queryMapping).length === 0) {
      return url;
    }
    const mapped = this.applyMapping(http.queryMapping, params, ctx);
    const entries = Object.entries(mapped).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    );
    if (entries.length === 0) return url;
    const qs = new URLSearchParams(
      entries.map(([k, v]) => [k, String(v)]),
    ).toString();
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${qs}`;
  }
}
