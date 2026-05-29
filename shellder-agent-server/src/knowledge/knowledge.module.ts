import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * 知识库管理模块（功能清单 §1.7 / 架构 Knowledge）。
 * - 知识库 CRUD
 * - 数据源管理
 * - 文档上传/分块/向量化
 * - 向量检索 API
 * - 向量化任务监控
 * - 导出 KnowledgeService 供 12-Agent 运行时调用。
 */
@Module({
  imports: [PrismaModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
