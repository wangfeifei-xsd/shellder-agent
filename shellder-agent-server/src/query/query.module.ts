import { Module, forwardRef } from '@nestjs/common';
import { ConnectorModule } from '../connector/connector.module';
import { LlmModule } from '../llm/llm.module';
import { PromptModule } from '../prompt/prompt.module';
import { ToolModule } from '../tool/tool.module';
import { Nl2SqlService } from './nl2sql.service';
import { QueryResultService } from './query-result.service';
import { DataScopeResolveService } from './data-scope-resolve.service';
import { SqlScopeFilterService } from './sql-scope-filter.service';

@Module({
  imports: [LlmModule, PromptModule, ConnectorModule, forwardRef(() => ToolModule)],
  providers: [
    Nl2SqlService,
    QueryResultService,
    DataScopeResolveService,
    SqlScopeFilterService,
  ],
  exports: [
    Nl2SqlService,
    QueryResultService,
    DataScopeResolveService,
    SqlScopeFilterService,
  ],
})
export class QueryModule {}
