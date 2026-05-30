import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PathyClientService {
  private readonly logger = new Logger(PathyClientService.name);

  private get baseUrl(): string {
    const raw = process.env.PATHY_KNOWLEDGE_SERVER_BASE_URL?.trim();
    if (!raw) {
      throw new Error('未配置 PATHY_KNOWLEDGE_SERVER_BASE_URL');
    }
    return raw.replace(/\/+$/, '');
  }

  private get timeoutMs(): number {
    const n = Number(process.env.PATHY_KNOWLEDGE_SERVER_TIMEOUT_MS ?? 120_000);
    return Number.isFinite(n) && n > 0 ? n : 120_000;
  }

  async compile(inputPaths: string[], outputPath: string): Promise<Record<string, unknown>> {
    return this.postJson('/api/v1/tasks/compile', {
      input_paths: inputPaths,
      output_path: outputPath,
    });
  }

  async embedWiki(path: string): Promise<Record<string, unknown>> {
    return this.postJson('/api/v1/wiki/embed', { path });
  }

  private async postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`pathy ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }
}
