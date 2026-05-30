import { Injectable, Logger } from '@nestjs/common';
import {
  knowledgeProxyTimeout,
  knowledgeProxyUnavailable,
  knowledgeProxyUpstream,
} from './knowledge-proxy.errors';
import { formatUpstreamErrorDetail } from './knowledge-proxy-error.util';

export type ProxyResponseType = 'json' | 'buffer' | 'none';

export interface ProxyRequestOptions {
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  responseType?: ProxyResponseType;
  timeoutMs?: number;
}

@Injectable()
export class KnowledgeProxyClient {
  private readonly logger = new Logger(KnowledgeProxyClient.name);

  private get baseUrl(): string {
    const raw = process.env.PATHY_KNOWLEDGE_SERVER_BASE_URL?.trim();
    if (!raw) {
      throw knowledgeProxyUnavailable(
        '未配置 PATHY_KNOWLEDGE_SERVER_BASE_URL，无法连接 pathy-knowledge-server',
      );
    }
    return raw.replace(/\/+$/, '');
  }

  private get defaultTimeoutMs(): number {
    const n = Number(process.env.PATHY_KNOWLEDGE_SERVER_TIMEOUT_MS ?? 30_000);
    return Number.isFinite(n) && n > 0 ? n : 30_000;
  }

  async request<T = unknown>(options: ProxyRequestOptions): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const url = this.buildUrl(options.path, options.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };

    let body: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (options.body instanceof FormData) {
        body = options.body;
      } else if (Buffer.isBuffer(options.body)) {
        body = new Uint8Array(options.body);
      } else if (typeof options.body === 'string') {
        body = options.body;
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else {
        body = JSON.stringify(options.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    try {
      const res = await fetch(url, {
        method: options.method,
        headers,
        body,
        signal: controller.signal,
      });

      const responseType = options.responseType ?? 'json';

      if (!res.ok) {
        const { detail, raw } = await this.readErrorBody(res);
        throw knowledgeProxyUpstream(res.status, detail, raw);
      }

      if (responseType === 'none') {
        return undefined as T;
      }

      if (responseType === 'buffer') {
        const buf = Buffer.from(await res.arrayBuffer());
        return {
          buffer: buf,
          contentType: res.headers.get('content-type') ?? 'application/octet-stream',
          contentDisposition: res.headers.get('content-disposition'),
        } as T;
      }

      const text = await res.text();
      if (!text) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw knowledgeProxyTimeout(timeoutMs);
      }
      if (
        err &&
        typeof err === 'object' &&
        'getStatus' in err &&
        typeof (err as { getStatus: () => number }).getStatus === 'function'
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`pathy 请求失败 ${options.method} ${url}: ${msg}`);
      throw knowledgeProxyUnavailable(
        `无法连接 pathy-knowledge-server（${this.baseUrl}）：${msg}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        if (typeof value === 'number') {
          if (!Number.isFinite(value)) continue;
          url.searchParams.set(key, String(Math.trunc(value)));
          continue;
        }
        if (typeof value === 'boolean') {
          url.searchParams.set(key, value ? 'true' : 'false');
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async readErrorBody(
    res: Response,
  ): Promise<{ detail: string; raw?: unknown }> {
    try {
      const text = await res.text();
      if (!text) return { detail: res.statusText };
      try {
        const json = JSON.parse(text) as unknown;
        return {
          detail: formatUpstreamErrorDetail(json) || text.slice(0, 500),
          raw: json,
        };
      } catch {
        return { detail: text.slice(0, 500) };
      }
    } catch {
      return { detail: res.statusText };
    }
  }
}
