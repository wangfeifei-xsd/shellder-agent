import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { NotificationTemplateType } from '@prisma/client';
import { Audit } from '../audit/decorators/audit.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/upsert-notification-template.dto';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { SystemSettingsService } from './system-settings.service';

@Controller('api/v1/system-settings')
@RequireMenu('settings')
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  // ── 配置 ────────────────────────────────────────────

  @Get('configs')
  getAllConfigs() {
    return this.service.getAllConfigs();
  }

  @Get('configs/group/:group')
  getConfigsByGroup(@Param('group') group: string) {
    return this.service.getConfigsByGroup(group);
  }

  @Get('configs/key/:key')
  async getConfigValue(@Param('key') key: string) {
    const value = await this.service.getConfigValue(key);
    return { configKey: key, configValue: value };
  }

  @Put('configs')
  @Audit({ action: 'system.config.upsert', module: 'system.settings', targetType: 'systemConfig' })
  upsertConfig(@Body() dto: UpsertConfigDto) {
    return this.service.upsertConfig(dto);
  }

  @Put('configs/batch')
  @Audit({ action: 'system.config.batchUpsert', module: 'system.settings', targetType: 'systemConfig' })
  batchUpsert(@Body() body: { items: UpsertConfigDto[] }) {
    return this.service.batchUpsert(body.items);
  }

  // ── 通知模板 ─────────────────────────────────────────

  @Get('notification-templates')
  listTemplates(@Query('type') type?: NotificationTemplateType) {
    return this.service.listTemplates(type);
  }

  @Get('notification-templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.service.getTemplate(id);
  }

  @Post('notification-templates')
  @Audit({ action: 'system.template.create', module: 'system.settings', targetType: 'notificationTemplate' })
  createTemplate(@Body() dto: CreateNotificationTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @Patch('notification-templates/:id')
  @Audit({ action: 'system.template.update', module: 'system.settings', targetType: 'notificationTemplate' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.service.updateTemplate(id, dto);
  }

  @Delete('notification-templates/:id')
  @Audit({ action: 'system.template.delete', module: 'system.settings', targetType: 'notificationTemplate' })
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }
}
