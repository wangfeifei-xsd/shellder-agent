import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  Logger,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { DocumentProcessingQueueService } from '../job-queue/document-processing-queue.service';
import { KnowledgeConnectionService } from './knowledge-connection.service';
import { UpsertKnowledgeConnectionDto } from './dto/upsert-knowledge-connection.dto';
import { KnowledgeProxyService } from './knowledge-proxy.service';
import { KnowledgeTenantScopeService } from './knowledge-tenant-scope.service';

interface UploadedBinary {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}

/**
 * 管理后台知识库代理 API（对齐 wiki 知识库服务 / API.md）。
 * 平台路径前缀：`/api/v1/knowledge/*` → 转发至 wiki 服务 `/api/v1/*`。
 * 租户隔离见 KnowledgeTenantScopeService。
 */
@Controller('api/v1/knowledge')
@RequireMenu('knowledge')
export class KnowledgeProxyController {
  private readonly logger = new Logger(KnowledgeProxyController.name);

  constructor(
    private readonly proxy: KnowledgeProxyService,
    private readonly connectionSettings: KnowledgeConnectionService,
    private readonly tenantScope: KnowledgeTenantScopeService,
    private readonly documentQueue: DocumentProcessingQueueService,
  ) {}

  @Get('connection')
  getConnection() {
    return this.connectionSettings.getSettingsForAdmin();
  }

  @Put('connection')
  @Audit({
    action: 'knowledge.connection.upsert',
    module: 'knowledge.manage',
    targetType: 'knowledge_connection',
  })
  upsertConnection(@Body() dto: UpsertKnowledgeConnectionDto) {
    return this.connectionSettings.upsertSettings(dto);
  }

  @Get('health')
  health() {
    return this.proxy.health();
  }

  @Get('config')
  getConfig(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
  ) {
    return this.proxy.getConfig(user, tenantId);
  }

  // ── layers ─────────────────────────────────────────────────

  @Get('layers/:layer/entries')
  listEntries(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query('prefix') prefix?: string,
  ) {
    return this.proxy.listLayerEntries(user, tenantId, layer, prefix);
  }

  @Get('layers/:layer/files')
  listFiles(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query('suffix') suffix?: string,
    @Query(
      'max_files',
      new DefaultValuePipe(undefined),
      new ParseIntPipe({ optional: true }),
    )
    maxFiles?: number,
  ) {
    return this.proxy.listLayerFiles(user, tenantId, layer, {
      suffix,
      max_files: maxFiles,
    });
  }

  @Get('layers/:layer/file')
  readFile(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query('path') path: string,
  ) {
    return this.proxy.readLayerFile(user, tenantId, layer, path);
  }

  @Put('layers/:layer/file')
  @Audit({ action: 'knowledge.writeFile', module: 'knowledge.manage', targetType: 'kb_layer_file' })
  writeFile(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query('path') path: string,
    @Body() body: { content: string },
  ) {
    return this.proxy.writeLayerFile(user, tenantId, layer, path, body.content);
  }

  @Delete('layers/:layer/file')
  @Audit({ action: 'knowledge.deleteFile', module: 'knowledge.manage', targetType: 'kb_layer_file' })
  deleteFile(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query('path') path: string,
  ) {
    return this.proxy.deleteLayerFile(user, tenantId, layer, path);
  }

  @Post('layers/:layer/upload')
  @UseInterceptors(FileInterceptor('file'))
  @Audit({ action: 'knowledge.uploadFile', module: 'knowledge.manage', targetType: 'kb_layer_file' })
  async uploadFile(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @UploadedFile() file: UploadedBinary,
    @Query('path') path?: string,
  ) {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype || 'application/octet-stream',
    });
    form.append('file', blob, file.originalname);
    if (path) form.append('path', path);
    const result = await this.proxy.uploadLayerFile(user, tenantId, layer, form);
    const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
    const scopedPath = path
      ? this.tenantScope.scopeLayerPath(wikiPrefix, path)
      : typeof (result as { path?: string })?.path === 'string'
        ? (result as { path: string }).path
        : null;
    if (scopedPath) {
      try {
        await this.documentQueue.scheduleAfterUpload({
          tenantId,
          layer,
          inputPath: scopedPath,
        });
      } catch (err) {
        this.logger.warn(
          `上传后异步编译/嵌入入队失败（可用手动「嵌入」或执行 Prisma 迁移 kb_layer_processing_job）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return result;
  }

  @Post('layers/:layer/embed')
  @Audit({ action: 'knowledge.embedFile', module: 'knowledge.manage', targetType: 'kb_layer_file' })
  async embedFile(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query('path') path: string,
  ) {
    return this.proxy.embedLayerFile(user, tenantId, layer, path);
  }

  @Get('layers/:layer/archive.zip')
  async downloadArchive(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query('prefix') prefix: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.proxy.downloadLayerArchive(
      user,
      tenantId,
      layer,
      prefix,
    );
    res.setHeader('Content-Type', result.contentType);
    if (result.contentDisposition) {
      res.setHeader('Content-Disposition', result.contentDisposition);
    }
    res.send(result.buffer);
  }

  // ── data-structure ─────────────────────────────────────────

  @Get('data-structure/tree/:layer')
  dataTree(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('layer') layer: string,
    @Query(
      'max_depth',
      new DefaultValuePipe(undefined),
      new ParseIntPipe({ optional: true }),
    )
    maxDepth?: number,
    @Query(
      'max_nodes',
      new DefaultValuePipe(undefined),
      new ParseIntPipe({ optional: true }),
    )
    maxNodes?: number,
  ) {
    return this.proxy.getDataTree(user, tenantId, layer, maxDepth, maxNodes);
  }

  @Post('data-structure/folders')
  @Audit({ action: 'knowledge.createFolder', module: 'knowledge.manage', targetType: 'kb_folder' })
  createFolder(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: { layer: string; name: string },
  ) {
    return this.proxy.createFolder(user, tenantId, body);
  }

  @Patch('data-structure/folders/rename')
  @Audit({ action: 'knowledge.renameFolder', module: 'knowledge.manage', targetType: 'kb_folder' })
  renameFolder(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: { layer: string; path: string; new_name: string },
  ) {
    return this.proxy.renameFolder(user, tenantId, body);
  }

  @Delete('data-structure/folders')
  @Audit({ action: 'knowledge.deleteFolder', module: 'knowledge.manage', targetType: 'kb_folder' })
  deleteFolder(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Query('layer') layer: string,
    @Query('path') path: string,
  ) {
    return this.proxy.deleteFolder(user, tenantId, layer, path);
  }

  // ── dialogue ───────────────────────────────────────────────

  @Post('dialogue/recall')
  dialogueRecall(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.proxy.dialogueRecall(tenantId, body, user);
  }

  @Post('dialogue/recall-test')
  @Audit({ action: 'knowledge.recallTest', module: 'knowledge.manage', targetType: 'kb_recall_test' })
  dialogueRecallTest(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.proxy.dialogueRecallTest(user, tenantId, body);
  }

  @Get('dialogue/stopwords')
  getStopwords(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
  ) {
    return this.proxy.getStopwords(user, tenantId);
  }

  @Put('dialogue/stopwords')
  putStopwords(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: { words: string[] },
  ) {
    return this.proxy.putStopwords(user, tenantId, body);
  }

  // ── media ──────────────────────────────────────────────────

  @Get('media/items')
  listMedia(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
  ) {
    return this.proxy.listMediaItems(user, tenantId);
  }

  @Post('media/upload')
  @UseInterceptors(FileInterceptor('file'))
  @Audit({ action: 'knowledge.uploadMedia', module: 'knowledge.manage', targetType: 'kb_media' })
  async uploadMedia(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @UploadedFile() file: UploadedBinary,
    @Body('title') title?: string,
    @Body('target_folder') targetFolder?: string,
  ) {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype || 'application/octet-stream',
    });
    form.append('file', blob, file.originalname);
    if (title) form.append('title', title);
    if (targetFolder) form.append('target_folder', targetFolder);
    return this.proxy.uploadMedia(user, tenantId, form);
  }

  @Get('media/meta/summary')
  mediaSummary(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
  ) {
    return this.proxy.mediaMetaSummary(user, tenantId);
  }

  @Post('media/reindex-backrefs')
  @Audit({ action: 'knowledge.reindexMedia', module: 'knowledge.manage', targetType: 'kb_media' })
  reindexBackrefs(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
  ) {
    return this.proxy.reindexMediaBackrefs(user, tenantId);
  }

  @Get('media/:code')
  async downloadMedia(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('code') code: string,
    @Res() res: Response,
  ) {
    const result = await this.proxy.downloadMedia(user, tenantId, code);
    res.setHeader('Content-Type', result.contentType);
    if (result.contentDisposition) {
      res.setHeader('Content-Disposition', result.contentDisposition);
    }
    res.send(result.buffer);
  }

  @Get('media/:code/backrefs')
  mediaBackrefs(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('code') code: string,
  ) {
    return this.proxy.mediaBackrefs(user, tenantId, code);
  }

  @Delete('media/:code')
  @Audit({ action: 'knowledge.deleteMedia', module: 'knowledge.manage', targetType: 'kb_media' })
  deleteMedia(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Param('code') code: string,
  ) {
    return this.proxy.deleteMedia(user, tenantId, code);
  }

  @Post('media/export-zip')
  @Audit({ action: 'knowledge.exportMedia', module: 'knowledge.manage', targetType: 'kb_media' })
  async exportMediaZip(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: { codes: string[] },
    @Res() res: Response,
  ) {
    const result = await this.proxy.exportMediaZip(user, tenantId, body.codes ?? []);
    res.setHeader('Content-Type', result.contentType);
    if (result.contentDisposition) {
      res.setHeader('Content-Disposition', result.contentDisposition);
    }
    res.send(result.buffer);
  }

  @Post('media/import-zip')
  @UseInterceptors(FileInterceptor('file'))
  @Audit({ action: 'knowledge.importMedia', module: 'knowledge.manage', targetType: 'kb_media' })
  importMediaZip(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @UploadedFile() file: UploadedBinary,
    @Body('target_folder') targetFolder?: string,
  ) {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype || 'application/zip',
    });
    form.append('file', blob, file.originalname);
    if (targetFolder) form.append('target_folder', targetFolder);
    return this.proxy.importMediaZip(user, tenantId, form);
  }

  @Post('media/batch-delete')
  @Audit({ action: 'knowledge.batchDeleteMedia', module: 'knowledge.manage', targetType: 'kb_media' })
  batchDeleteMedia(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: { codes: string[] },
  ) {
    return this.proxy.batchDeleteMedia(user, tenantId, body.codes ?? []);
  }

  @Post('tasks/polish-text')
  @Audit({ action: 'knowledge.polishText', module: 'knowledge.manage', targetType: 'kb_task' })
  polishText(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: { content: string; instruction?: string },
  ) {
    return this.proxy.polishText(user, tenantId, body);
  }

  @Post('media/resolve-from-text')
  resolveMediaFromText(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId: string,
    @Body() body: { text?: string; codes?: string[] },
  ) {
    return this.proxy.resolveMediaFromText(user, tenantId, body);
  }
}
