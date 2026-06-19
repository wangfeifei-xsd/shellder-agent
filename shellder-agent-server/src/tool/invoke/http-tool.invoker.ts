import { Injectable } from '@nestjs/common';
import { Connector, Tool } from '@prisma/client';
import { HttpToolConfig } from '../tool.types';
import { InvokeContext } from '../tool-invocation.types';
import { maskHeaders, tryParseJson } from './http-auth.util';
import { InvokeUrlResolver } from './invoke-url.resolver';
import { MappedResponse, ResponseMapper, ResponseMappingConfig } from './response-mapper.util';

export interface HttpInvokeInput {
  tool: Tool;
  connector: Connector;
  http: HttpToolConfig;
  params: Record<string, unknown>;
  ctx: InvokeContext;
  responseMapping?: ResponseMappingConfig;
}

export interface HttpInvokeOutput {
  httpOk: boolean;
  statusCode: number;
  durationMs: number;
  rawRequest: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  rawResponse: { status: number; body: unknown };
  mapped: MappedResponse;
  errorMessage?: string;
}

@Injectable()
export class HttpToolInvoker {
  private readonly urlResolver = new InvokeUrlResolver();
  private readonly responseMapper = new ResponseMapper();

  async invoke(input: HttpInvokeInput): Promise<HttpInvokeOutput> {
    const { tool, connector, http, params, ctx, responseMapping } = input;
    const timeoutMs = tool.timeoutMs ?? 10000;
    const resolved = this.urlResolver.resolve(connector, http, params, ctx, timeoutMs);

    const rawRequest = {
      method: resolved.method,
      url: resolved.url,
      headers: maskHeaders(resolved.headers),
      body: resolved.body,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(resolved.url, {
        method: resolved.method,
        headers: resolved.headers,
        body: resolved.bodyString,
        signal: controller.signal,
      });
      const durationMs = Date.now() - start;
      const text = await res.text();
      const parsed = tryParseJson(text);
      const body = parsed ?? text;
      const httpOk = res.status < 400;
      const mapped = this.responseMapper.map(httpOk, body, responseMapping);

      return {
        httpOk,
        statusCode: res.status,
        durationMs,
        rawRequest,
        rawResponse: { status: res.status, body },
        mapped,
        errorMessage: httpOk ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const aborted = err instanceof Error && err.name === 'AbortError';
      const errorMessage = aborted
        ? `调用超时（>${timeoutMs}ms）`
        : `调用失败：${err instanceof Error ? err.message : String(err)}`;

      return {
        httpOk: false,
        statusCode: 0,
        durationMs,
        rawRequest,
        rawResponse: { status: 0, body: null },
        mapped: {
          success: false,
          transformedResult: null,
          message: errorMessage,
        },
        errorMessage,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
