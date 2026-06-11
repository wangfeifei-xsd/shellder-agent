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
import { CreateOpenApiAppDto } from './dto/create-openapi-app.dto';
import { QueryOpenApiAppDto } from './dto/query-openapi-app.dto';
import { QueryOpenApiCallLogDto } from './dto/query-openapi-call-log.dto';
import { UpdateOpenApiAppDto } from './dto/update-openapi-app.dto';
import { OpenApiAppService } from './openapi-app.service';
import { OpenApiCallLogService } from './openapi-call-log.service';

/** OpenAPI 管理后台接口（功能清单 §1.12） */
@Controller('api/v1/openapi-apps')
@RequireMenu('openapi')
export class OpenApiAppController {
  constructor(
    private readonly appService: OpenApiAppService,
    private readonly callLogService: OpenApiCallLogService,
  ) {}

  @Post()
  @Audit({ action: 'openapi-app.create', module: 'openapi', targetType: 'openapi_app' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOpenApiAppDto) {
    return this.appService.create(dto, user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryOpenApiAppDto) {
    return this.appService.findMany(user, query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.appService.findOne(id);
  }

  @Patch(':id')
  @Audit({ action: 'openapi-app.update', module: 'openapi', targetType: 'openapi_app' })
  update(@Param('id') id: string, @Body() dto: UpdateOpenApiAppDto) {
    return this.appService.update(id, dto);
  }

  @Post(':id/reset-secret')
  @Audit({ action: 'openapi-app.resetSecret', module: 'openapi', targetType: 'openapi_app' })
  resetSecret(@Param('id') id: string) {
    return this.appService.resetSecret(id);
  }

  @Delete(':id')
  @Audit({ action: 'openapi-app.delete', module: 'openapi', targetType: 'openapi_app' })
  remove(@Param('id') id: string) {
    return this.appService.remove(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.appService.getCallStats(id);
  }

  @Get(':id/call-logs')
  callLogs(@Param('id') id: string, @Query() query: QueryOpenApiCallLogDto) {
    return this.callLogService.findMany({ ...query, appId: id });
  }
}

/** 调用日志查询（跨应用） */
@Controller('api/v1/openapi-call-logs')
@RequireMenu('openapi')
export class OpenApiCallLogController {
  constructor(private readonly callLogService: OpenApiCallLogService) {}

  @Get()
  list(@Query() query: QueryOpenApiCallLogDto) {
    return this.callLogService.findMany(query);
  }

  @Get('stats')
  stats(@Query('appId') appId?: string) {
    return this.callLogService.getStats(appId);
  }
}
