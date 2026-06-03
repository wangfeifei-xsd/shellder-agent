import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 租户与 wiki 存储路径隔离（V1）。
 *
 * wiki 知识库服务 无内置多租户；平台在代理层注入 wiki 子路径前缀：
 * - 默认：`tenants/{tenantId}/`（raw/wiki/schema 层内相对路径均加此前缀）
 * - 覆盖：`knowledge_base.wiki_prefix`（每租户可绑定一条活跃知识库元数据记录）
 *
 * 部署约定：wiki 服务 DATA_ROOT 下需按上述前缀组织各租户目录，或由运维为每租户部署独立 wiki 服务实例并配置
 * wiki 服务地址见 system_config.knowledge.wikiBaseUrl（知识库管理配置）。
 */
@Injectable()
export class KnowledgeTenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWikiPrefix(tenantId: string): Promise<string> {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: {
        tenantId,
        status: 'active',
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { wikiPrefix: true },
    });
    if (kb?.wikiPrefix != null && kb.wikiPrefix !== '') {
      return this.normalizePrefix(kb.wikiPrefix);
    }
    return `tenants/${tenantId}/`;
  }

  /** 将层内相对 path/prefix 加上租户 wiki 根前缀 */
  scopeLayerPath(wikiPrefix: string, relativePath: string): string {
    if (!wikiPrefix) {
      return relativePath.replace(/^\//, '');
    }
    const base = this.normalizePrefix(wikiPrefix);
    const rel = (relativePath ?? '').replace(/^\//, '');
    if (!rel) return base;
    if (rel === base || rel.startsWith(base)) return rel;
    return `${base}${rel}`;
  }

  scopeLayerPrefix(wikiPrefix: string, prefix: string): string {
    return this.scopeLayerPath(wikiPrefix, prefix ?? '');
  }

  /** 合并 dialogue recall 请求体中的 wiki_prefix */
  mergeRecallBody<T extends { wiki_prefix?: string }>(
    wikiPrefix: string,
    body: T,
  ): T {
    const scoped = this.scopeLayerPrefix(wikiPrefix, body.wiki_prefix ?? '');
    return { ...body, wiki_prefix: scoped };
  }

  normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/^\/+/, '');
    if (!trimmed) return '';
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }
}
