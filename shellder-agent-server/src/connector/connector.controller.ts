import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { ConnectorSchemaService } from './connector-schema.service';
import { ConnectorService } from './connector.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { QueryConnectorDto } from './dto/query-connector.dto';
import { UpdateConnectorStatusDto } from './dto/update-status.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

/** 连接器管理（功能清单 §1.6）；归属「连接器管理」菜单（connector） */
@Controller('api/v1/connectors')
@RequireMenu('connector')
export class ConnectorController {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connectorSchemaService: ConnectorSchemaService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryConnectorDto) {
    return this.connectorService.findMany(user, query);
  }

  /** 库表结构列表（静态路由须在 :id 之前，避免把 db-schema 当成连接器 id） */
  @Get('db-schema')
  listDbSchema(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.connectorSchemaService.listDbSchemaSummaries(user, tenantId);
  }

  @Post()
  @Audit({ action: 'connector.create', module: 'connector.manage', targetType: 'connector' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConnectorDto) {
    return this.connectorService.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'connector.update', module: 'connector.manage', targetType: 'connector' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConnectorDto,
  ) {
    return this.connectorService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Audit({
    action: 'connector.updateStatus',
    module: 'connector.manage',
    targetType: 'connector',
  })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConnectorStatusDto,
  ) {
    return this.connectorService.updateStatus(user, id, dto.status);
  }

  @Delete(':id')
  @Audit({ action: 'connector.delete', module: 'connector.manage', targetType: 'connector' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorService.remove(user, id);
  }

  /** ER 限制字段分析（与 ConnectorSchemaController 同路径，便于热更新后路由可见） */
  @Post(':id/er-diagram/suggest-data-scope')
  @Audit({
    action: 'connector.erDiagram.suggestDataScope',
    module: 'connector.manage',
    targetType: 'connector',
  })
  suggestDataScope(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorSchemaService.suggestDataScope(user, id);
  }
}
