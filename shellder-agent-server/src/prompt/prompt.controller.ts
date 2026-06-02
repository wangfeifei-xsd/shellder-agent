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
import {
  RequireMenu,
  RequireModule,
} from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { LlmService } from '../llm/llm.service';
import { CreatePromptBindingDto, QueryPromptBindingDto, UpdatePromptBindingDto } from './dto/prompt-binding.dto';
import { CreatePromptTemplateDto } from './dto/create-prompt-template.dto';
import { QueryPromptTemplateDto } from './dto/query-prompt-template.dto';
import { RenderPromptDto, RenderTestLlmDto } from './dto/render-prompt.dto';
import { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';
import { UpdatePromptVersionDto } from './dto/update-prompt-version.dto';
import { PromptBindingService } from './prompt-binding.service';
import { PromptResolverService } from './prompt-resolver.service';
import { PromptTemplateService } from './prompt-template.service';
import { PromptVersionService } from './prompt-version.service';

@Controller('api/v1/prompts')
@RequireMenu('prompt')
export class PromptController {
  constructor(
    private readonly templateService: PromptTemplateService,
    private readonly versionService: PromptVersionService,
    private readonly resolver: PromptResolverService,
    private readonly bindingService: PromptBindingService,
    private readonly llm: LlmService,
  ) {}

  @Get('templates')
  @RequireModule('prompt:read')
  listTemplates(@CurrentUser() user: AuthUser, @Query() query: QueryPromptTemplateDto) {
    return this.templateService.findMany(user, query);
  }

  @Post('templates')
  @RequireModule('prompt:write')
  @Audit({ action: 'prompt.template.create', module: 'prompt.manage', targetType: 'prompt_template' })
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreatePromptTemplateDto) {
    return this.templateService.create(user, dto);
  }

  @Get('templates/:id')
  @RequireModule('prompt:read')
  getTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templateService.findOne(user, id);
  }

  @Patch('templates/:id')
  @RequireModule('prompt:write')
  @Audit({ action: 'prompt.template.update', module: 'prompt.manage', targetType: 'prompt_template' })
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromptTemplateDto,
  ) {
    return this.templateService.update(user, id, dto);
  }

  @Get('templates/:id/versions')
  @RequireModule('prompt:read')
  listVersions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.versionService.listVersions(user, id);
  }

  @Post('templates/:id/versions')
  @RequireModule('prompt:write')
  @Audit({ action: 'prompt.version.createDraft', module: 'prompt.manage', targetType: 'prompt_version' })
  createDraft(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.versionService.createDraftFromPublished(user, id);
  }

  @Patch('versions/:versionId')
  @RequireModule('prompt:write')
  @Audit({ action: 'prompt.version.update', module: 'prompt.manage', targetType: 'prompt_version' })
  updateVersion(@Param('versionId') versionId: string, @Body() dto: UpdatePromptVersionDto) {
    return this.versionService.updateDraft(versionId, dto);
  }

  @Post('versions/:versionId/publish')
  @RequireModule('prompt:publish')
  @Audit({ action: 'prompt.version.publish', module: 'prompt.manage', targetType: 'prompt_version' })
  publish(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
  ) {
    return this.versionService.publish(user, versionId);
  }

  @Post('versions/:versionId/rollback')
  @RequireModule('prompt:publish')
  @Audit({ action: 'prompt.version.rollback', module: 'prompt.manage', targetType: 'prompt_version' })
  rollback(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
  ) {
    return this.versionService.rollback(user, versionId);
  }

  @Post('render')
  @RequireModule('prompt:read')
  async render(@Body() dto: RenderPromptDto) {
    return this.resolver.render({
      promptKey: dto.promptKey,
      tenantId: dto.tenantId,
      channel: dto.channel ?? 'published',
      variables: dto.variables ?? {},
    });
  }

  @Post('render/test-llm')
  @RequireModule('prompt:debug')
  @Audit({ action: 'prompt.render.testLlm', module: 'prompt.manage', targetType: 'prompt_render' })
  async renderTestLlm(@Body() dto: RenderTestLlmDto) {
    const rendered = await this.resolver.render({
      promptKey: dto.promptKey,
      tenantId: dto.tenantId,
      channel: dto.channel ?? 'published',
      variables: dto.variables ?? {},
    });
    await this.llm.assertConfigured();
    const messages = [
      { role: 'system' as const, content: rendered.content },
      {
        role: 'user' as const,
        content: dto.userMessage?.trim() || '请根据 system 提示完成试跑回复。',
      },
    ];
    const completion = await this.llm.chatCompletion(messages);
    return {
      render: rendered,
      llm: {
        text: completion.text,
        model: completion.model,
        elapsedMs: completion.elapsedMs,
      },
    };
  }

  @Get('bindings')
  @RequireModule('prompt:read')
  listBindings(@Query() query: QueryPromptBindingDto) {
    return this.bindingService.findMany(query);
  }

  @Post('bindings')
  @RequireModule('prompt:write')
  @Audit({ action: 'prompt.binding.create', module: 'prompt.manage', targetType: 'prompt_binding' })
  createBinding(@Body() dto: CreatePromptBindingDto) {
    return this.bindingService.create(dto);
  }

  @Patch('bindings/:id')
  @RequireModule('prompt:write')
  @Audit({ action: 'prompt.binding.update', module: 'prompt.manage', targetType: 'prompt_binding' })
  updateBinding(@Param('id') id: string, @Body() dto: UpdatePromptBindingDto) {
    return this.bindingService.update(id, dto);
  }

  @Delete('bindings/:id')
  @RequireModule('prompt:write')
  @Audit({ action: 'prompt.binding.delete', module: 'prompt.manage', targetType: 'prompt_binding' })
  deleteBinding(@Param('id') id: string) {
    return this.bindingService.remove(id);
  }
}
