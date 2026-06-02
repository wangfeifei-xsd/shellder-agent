import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { PromptBindingService } from './prompt-binding.service';
import { PromptController } from './prompt.controller';
import { PromptResolverService } from './prompt-resolver.service';
import { PromptTemplateService } from './prompt-template.service';
import { PromptVersionService } from './prompt-version.service';

@Module({
  imports: [LlmModule],
  controllers: [PromptController],
  providers: [
    PromptTemplateService,
    PromptVersionService,
    PromptResolverService,
    PromptBindingService,
  ],
  exports: [PromptResolverService],
})
export class PromptModule {}
