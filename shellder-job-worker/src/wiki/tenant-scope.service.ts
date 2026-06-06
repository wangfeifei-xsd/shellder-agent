import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 与 server KnowledgeTenantScopeService 对齐的租户 wiki 路径前缀 */
@Injectable()
export class TenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWikiPrefixes(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.knowledgeBase.findMany({
      where: { tenantId, status: 'active', deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      select: { wikiPrefix: true },
    });

    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: string) => {
      const norm = this.normalizePrefix(raw);
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      out.push(norm);
    };

    for (const row of rows) {
      if (row.wikiPrefix != null && row.wikiPrefix.trim() !== '') {
        push(row.wikiPrefix);
      } else {
        push(`tenants/${tenantId}/`);
      }
    }

    if (out.length === 0) {
      push(`tenants/${tenantId}/`);
    }
    return out;
  }

  async resolveWikiPrefix(tenantId: string): Promise<string> {
    const prefixes = await this.resolveWikiPrefixes(tenantId);
    return prefixes[0] ?? `tenants/${tenantId}/`;
  }

  scopeLayerPath(wikiPrefixes: string | string[], relativePath: string): string {
    const list = Array.isArray(wikiPrefixes) ? wikiPrefixes : [wikiPrefixes];
    const rel = (relativePath ?? '').replace(/^\//, '');
    if (!rel) {
      return list.length === 1 ? this.normalizePrefix(list[0]) : '';
    }
    for (const raw of list) {
      const base = this.normalizePrefix(raw);
      const baseNoSlash = base.replace(/\/$/, '');
      if (rel === baseNoSlash || rel.startsWith(base)) return rel;
    }
    if (list.length === 1) {
      const base = this.normalizePrefix(list[0]);
      if (!base) return rel;
      return `${base}${rel}`;
    }
    return rel;
  }

  normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/^\/+/, '');
    if (!trimmed) return '';
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }
}
