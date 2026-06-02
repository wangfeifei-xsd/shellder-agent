import { Module, forwardRef } from '@nestjs/common';
import { ConnectorModule } from '../connector/connector.module';
import { LlmModule } from '../llm/llm.module';
import { PromptModule } from '../prompt/prompt.module';
import { ToolModule } from '../tool/tool.module';
import { Nl2SqlService } from './nl2sql.service';
import { QueryResultService } from './query-result.service';

@Module({
  imports: [LlmModule, PromptModule, ConnectorModule, forwardRef(() => ToolModule)],
  providers: [Nl2SqlService, QueryResultService],
  exports: [Nl2SqlService, QueryResultService],
})
export class QueryModule {}
