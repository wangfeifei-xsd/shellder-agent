import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 与 server KnowledgeTenantScopeService 对齐的租户 pathy 路径前缀 */
@Injectable()
export class TenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWikiPrefix(tenantId: string): Promise<string> {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { tenantId, status: 'active', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { pathyWikiPrefix: true },
    });
    if (kb?.pathyWikiPrefix != null && kb.pathyWikiPrefix !== '') {
      return this.normalizePrefix(kb.pathyWikiPrefix);
    }
    return `tenants/${tenantId}/`;
  }

  scopeLayerPath(wikiPrefix: string, relativePath: string): string {
    if (!wikiPrefix) return relativePath.replace(/^\//, '');
    const base = this.normalizePrefix(wikiPrefix);
    const rel = (relativePath ?? '').replace(/^\//, '');
    if (!rel) return base;
    if (rel === base || rel.startsWith(base)) return rel;
    return `${base}${rel}`;
  }

  normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/^\/+/, '');
    if (!trimmed) return '';
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }
}
