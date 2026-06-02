import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { hasPermission } from '../auth/permissions';
import { PermissionService } from '../auth/permission.service';
import { PROMPT_KEYS } from '../prompt/prompt-keys';
import { KnowledgeProxyService } from '../knowledge/knowledge-proxy.service';
import { QaPipelineService } from './qa-pipeline.service';

/**
 * 问答预览 API：与 Runtime 相同的两阶段 recall + 平台 LLM（非 SSE）。
 */
@Controller('api/v1/knowledge')
@RequireMenu('knowledge')
export class QaPreviewController {
  constructor(
    private readonly qaPipeline: QaPipelineService,
    private readonly knowledgeProxy: KnowledgeProxyService,
    private readonly permissionService: PermissionService,
  ) {}

  @Post('dialogue/qa-preview')
  @Audit({ action: 'knowledge.qaPreview', module: 'knowledge.manage', targetType: 'kb_qa_preview' })
  async qaPreview(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body()
    body: {
      query: string;
      top_k_chunks?: number;
      bm25_top_n?: number;
      vector_top_n?: number;
      wiki_prefix?: string;
    },
    @Query('channel') channel?: 'published' | 'draft',
    @Query('prompt_key') promptKey?: string,
  ) {
    await this.knowledgeProxy.assertTenantAccess(user, tenantId);

    const resolvedChannel = channel ?? 'published';
    if (resolvedChannel === 'draft') {
      const permissions = await this.permissionService.resolveForUser(user.id);
      if (
        !permissions.isSuperAdmin &&
        !hasPermission(permissions.modules, 'prompt:debug')
      ) {
        throw new ForbiddenException({
          code: 'MODULE_FORBIDDEN',
          message: 'draft 试跑需要 prompt:debug 权限',
        });
      }
    }

    const result = await this.qaPipeline.run({
      tenantId,
      userMessage: body.query,
      topKChunks: body.top_k_chunks,
      recallBody: {
        bm25_top_n: body.bm25_top_n,
        vector_top_n: body.vector_top_n,
        wiki_prefix: body.wiki_prefix,
      },
      promptChannel: resolvedChannel,
      promptKey: promptKey ?? PROMPT_KEYS.QA_DIALOGUE_SYSTEM,
    });

    return {
      user_query: body.query,
      recall_method: result.recall.recall_method,
      recall_hits: result.recall.recall_hits,
      injected_context: result.recall.injected_context,
      assistant_reply: result.replyText,
      model: result.model,
      elapsed_ms: result.elapsedMs,
      prompt_version: result.promptVersion,
      prompt_key: promptKey ?? PROMPT_KEYS.QA_DIALOGUE_SYSTEM,
      prompt_channel: resolvedChannel,
      message: result.recall.message,
      files_scanned: (result.recall as { files_scanned?: number }).files_scanned,
    };
  }
}
