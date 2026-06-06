import { Module } from '@nestjs/common';
import { JobQueueModule } from '../job-queue/job-queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { KnowledgeConnectionService } from './knowledge-connection.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeProxyClient } from './knowledge-proxy.client';
import { KnowledgeProxyService } from './knowledge-proxy.service';
import { KnowledgeProxyController } from './knowledge-proxy.controller';
import { KnowledgeTenantScopeService } from './knowledge-tenant-scope.service';

/**
 * 知识库模块（功能清单 §1.7 / 架构 §4.5）。
 * - 代理 wiki 知识库服务：四层存储、媒体、对话召回
 * - knowledge_base 表：租户与 wiki wiki 路径绑定元数据
 * - 导出 KnowledgeProxyService 供问答型运行时召回
 */
@Module({
  imports: [PrismaModule, JobQueueModule, SystemSettingsModule],
  controllers: [KnowledgeController, KnowledgeProxyController],
  providers: [
    KnowledgeService,
    KnowledgeConnectionService,
    KnowledgeProxyClient,
    KnowledgeProxyService,
    KnowledgeTenantScopeService,
  ],
  exports: [
    KnowledgeService,
    KnowledgeProxyService,
    KnowledgeConnectionService,
    KnowledgeTenantScopeService,
  ],
})
export class KnowledgeModule {}
