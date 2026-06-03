import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWikiBaseUrl, resolveWikiTimeoutMs } from './knowledge-connection.util';

@Injectable()
export class WikiClientService {
  private readonly logger = new Logger(WikiClientService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const baseUrl = await resolveWikiBaseUrl(this.prisma);
    const timeoutMs = await resolveWikiTimeoutMs(this.prisma);
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`wiki ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }
}
