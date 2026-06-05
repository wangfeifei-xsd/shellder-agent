import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { ConnectorService } from './connector.service';
import { ConnectorSchemaService } from './connector-schema.service';
import { ConnectorSqlTestService } from './connector-sql-test.service';
import { ConnectorSqlTestDto } from './dto/connector-sql-test.dto';
import { SaveErDraftDto } from './dto/save-er-draft.dto';

/** 只读库结构抽取与 ER 关系图（查询型能力 §4） */
@Controller('api/v1/connectors')
@RequireMenu('connector')
export class ConnectorSchemaController {
  constructor(
    private readonly schemaService: ConnectorSchemaService,
    private readonly connectorService: ConnectorService,
    private readonly connectorSqlTestService: ConnectorSqlTestService,
  ) {}

  /** 连通性测试（与 ConnectorController 同路径，便于与 introspect 等同属子资源路由） */
  @Post(':id/test')
  @Audit({ action: 'connector.test', module: 'connector.manage', targetType: 'connector' })
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorService.test(user, id);
  }

  /** 只读库 SQL 查询测试（『查询型』配置 → 查询测试） */
  @Post(':id/sql-test')
  @Audit({
    action: 'connector.sqlTest',
    module: 'connector.manage',
    targetType: 'connector',
  })
  sqlTest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConnectorSqlTestDto,
  ) {
    return this.connectorSqlTestService.sqlTest(user, id, dto);
  }

  @Post(':id/introspect')
  @Audit({
    action: 'connector.introspect',
    module: 'connector.manage',
    targetType: 'connector',
  })
  introspect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.schemaService.introspect(user, id, true);
  }

  @Get(':id/schema')
  getSchema(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.schemaService.getSchema(user, id);
  }

  @Get(':id/er-diagram')
  getErDiagram(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.schemaService.getErDiagram(user, id);
  }

  @Put(':id/er-diagram/draft')
  @Audit({
    action: 'connector.erDraft.save',
    module: 'connector.manage',
    targetType: 'connector',
  })
  saveDraft(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveErDraftDto,
  ) {
    return this.schemaService.saveDraft(user, id, dto.diagram);
  }

  @Post(':id/er-diagram/publish')
  @Audit({
    action: 'connector.erDiagram.publish',
    module: 'connector.manage',
    targetType: 'connector',
  })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.schemaService.publish(user, id);
  }

  @Post(':id/er-diagram/regenerate')
  @Audit({
    action: 'connector.erDiagram.regenerate',
    module: 'connector.manage',
    targetType: 'connector',
  })
  regenerate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.schemaService.regenerateDraft(user, id);
  }

}
