import { Module, forwardRef } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PromptModule } from '../prompt/prompt.module';
import { ToolModule } from '../tool/tool.module';
import { ConnectivityTestService } from './connectivity-test.service';
import { ConnectorController } from './connector.controller';
import { ConnectorIntrospectionService } from './connector-introspection.service';
import { ConnectorSchemaController } from './connector-schema.controller';
import { ConnectorSchemaService } from './connector-schema.service';
import { ConnectorSqlTestService } from './connector-sql-test.service';
import { ConnectorService } from './connector.service';
import { ErDiagramService } from './er-diagram.service';

/**
 * 连接器管理模块（功能清单 §1.6 / 架构 §4.4）。
 * - 提供三类连接器 CRUD、连通性测试（db_readonly 为 SELECT 1）。
 * - 只读库：结构抽取、ER 关系图草稿/发布（查询型能力 §4）。
 */
@Module({
  imports: [PrismaModule, LlmModule, PromptModule, forwardRef(() => ToolModule)],
  controllers: [ConnectorController, ConnectorSchemaController],
  providers: [
    ConnectorService,
    ConnectivityTestService,
    ConnectorIntrospectionService,
    ErDiagramService,
    ConnectorSchemaService,
    ConnectorSqlTestService,
  ],
  exports: [
    ConnectorService,
    ConnectorIntrospectionService,
    ErDiagramService,
  ],
})
export class ConnectorModule {}
