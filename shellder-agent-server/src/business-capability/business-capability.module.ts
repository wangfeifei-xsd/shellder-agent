import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LlmModule } from '../llm/llm.module';
import { AuditModule } from '../audit/audit.module';
import { ToolModule } from '../tool/tool.module';
import { PromptModule } from '../prompt/prompt.module';
import { QueryModule } from '../query/query.module';
import { QaCapabilityHandler } from './qa.handler';
import { QaPipelineService } from './qa-pipeline.service';
import { QaPreviewController } from './qa-preview.controller';
import { QueryCapabilityHandler } from './query.handler';
import { ActionCapabilityHandler } from './action.handler';
import { WorkflowCapabilityHandler } from './workflow.handler';
import { registerCapabilityHandler } from '../agent-runtime/capability-handlers';

/**
 * 四类业务能力模块（Phase 13）。
 *
 * 提供问答型、查询型、操作型、流程型四类能力的真实实现，
 * 模块初始化时自动注册到 Agent Runtime 的 Handler 注册表，
 * 替换 Phase 12 的 Mock 骨架。
 */
@Module({
  imports: [
    PrismaModule,
    KnowledgeModule,
    LlmModule,
    AuditModule,
    ToolModule,
    QueryModule,
    PromptModule,
  ],
  controllers: [QaPreviewController],
  providers: [
    QaPipelineService,
    QaCapabilityHandler,
    QueryCapabilityHandler,
    ActionCapabilityHandler,
    WorkflowCapabilityHandler,
  ],
  exports: [
    QaPipelineService,
    QaCapabilityHandler,
    QueryCapabilityHandler,
    ActionCapabilityHandler,
    WorkflowCapabilityHandler,
  ],
})
export class BusinessCapabilityModule implements OnModuleInit {
  constructor(
    private readonly qaHandler: QaCapabilityHandler,
    private readonly queryHandler: QueryCapabilityHandler,
    private readonly actionHandler: ActionCapabilityHandler,
    private readonly workflowHandler: WorkflowCapabilityHandler,
  ) {}

  onModuleInit() {
    registerCapabilityHandler(this.qaHandler);
    registerCapabilityHandler(this.queryHandler);
    registerCapabilityHandler(this.actionHandler);
    registerCapabilityHandler(this.workflowHandler);
  }
}
