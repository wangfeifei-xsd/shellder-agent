import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { LlmConfigService } from './llm-config.service';
import { LlmService } from './llm.service';
import { LlmConnectionTestDto, UpsertLlmSettingsDto } from './dto/upsert-llm-settings.dto';

/**
 * 平台 LLM 接入配置（实施规格 §4 / 执行计划 19 §3.2）。
 * 存储于 system_config，不代理 wiki settings/llm。
 */
@Controller('api/v1/settings')
@RequireMenu('settings')
export class LlmSettingsController {
  constructor(
    private readonly configService: LlmConfigService,
    private readonly llmService: LlmService,
  ) {}

  @Get('llm')
  getLlmSettings() {
    return this.configService.getSettingsView();
  }

  @Put('llm')
  @Audit({ action: 'settings.llm.update', module: 'system.settings', targetType: 'llmConfig' })
  updateLlmSettings(@Body() dto: UpsertLlmSettingsDto) {
    return this.configService.updateSettings(dto);
  }

  @Post('llm/test')
  testLlmConnection(@Body() dto: LlmConnectionTestDto) {
    return this.llmService.testConnection(dto);
  }
}
