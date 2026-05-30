import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeProxyClient } from './knowledge-proxy.client';
import { KnowledgeProxyService } from './knowledge-proxy.service';
import { KnowledgeProxyController } from './knowledge-proxy.controller';
import { KnowledgeTenantScopeService } from './knowledge-tenant-scope.service';

/**
 * 知识库模块（功能清单 §1.7 / 架构 §4.5）。
 * - 代理 pathy-knowledge-server：四层存储、媒体、对话召回
 * - knowledge_base 表：租户与 pathy wiki 路径绑定元数据
 * - 导出 KnowledgeProxyService 供问答型运行时召回
 */
@Module({
  imports: [PrismaModule],
  controllers: [KnowledgeController, KnowledgeProxyController],
  providers: [
    KnowledgeService,
    KnowledgeProxyClient,
    KnowledgeProxyService,
    KnowledgeTenantScopeService,
  ],
  exports: [KnowledgeService, KnowledgeProxyService],
})
export class KnowledgeModule {}
