import { Module } from '@nestjs/common';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { LlmConfigService } from './llm-config.service';
import { LlmSettingsController } from './llm-settings.controller';
import { LlmService } from './llm.service';

@Module({
  imports: [SystemSettingsModule],
  controllers: [LlmSettingsController],
  providers: [LlmConfigService, LlmService],
  exports: [LlmConfigService, LlmService],
})
export class LlmModule {}
