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
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { QueryKnowledgeBaseDto } from './dto/query-knowledge-base.dto';
import { CreateDataSourceDto } from './dto/create-data-source.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { RetrieveDto } from './dto/retrieve.dto';
import { QueryEmbeddingTaskDto } from './dto/query-embedding-task.dto';

/** 租户 wiki 绑定元数据；内容/召回见 {@link KnowledgeProxyController} */
@Controller('api/v1/knowledge-bases')
@RequireMenu('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  // ── 知识库 CRUD ────────────────────────────────────────────

  @Post()
  @Audit({ action: 'knowledge.create', module: 'knowledge.manage', targetType: 'knowledge_base' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledgeService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryKnowledgeBaseDto) {
    return this.knowledgeService.findMany(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'knowledge.update', module: 'knowledge.manage', targetType: 'knowledge_base' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeService.update(user, id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'knowledge.delete', module: 'knowledge.manage', targetType: 'knowledge_base' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.remove(user, id);
  }

  // ── 数据源管理 ─────────────────────────────────────────────

  @Post(':id/data-sources')
  @Audit({ action: 'knowledge.addDataSource', module: 'knowledge.manage', targetType: 'kb_data_source' })
  addDataSource(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateDataSourceDto,
  ) {
    return this.knowledgeService.addDataSource(user, id, dto);
  }

  @Get(':id/data-sources')
  listDataSources(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.listDataSources(user, id);
  }

  @Delete(':id/data-sources/:dsId')
  @Audit({ action: 'knowledge.removeDataSource', module: 'knowledge.manage', targetType: 'kb_data_source' })
  removeDataSource(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('dsId') dsId: string,
  ) {
    return this.knowledgeService.removeDataSource(user, id, dsId);
  }

  // ── 文档管理 ───────────────────────────────────────────────

  @Post(':id/documents/upload')
  @Audit({ action: 'knowledge.uploadDocument', module: 'knowledge.manage', targetType: 'kb_document' })
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { title: string; content: string; fileKey?: string; fileSize?: number; mimeType?: string },
  ) {
    return this.knowledgeService.uploadDocument(user, id, body);
  }

  @Get(':id/documents')
  listDocuments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: QueryDocumentDto,
  ) {
    return this.knowledgeService.listDocuments(user, id, query);
  }

  @Delete(':id/documents/:docId')
  @Audit({ action: 'knowledge.deleteDocument', module: 'knowledge.manage', targetType: 'kb_document' })
  removeDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledgeService.removeDocument(user, id, docId);
  }

  // ── 向量检索 ───────────────────────────────────────────────

  @Post(':id/retrieve')
  retrieve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RetrieveDto,
  ) {
    return this.knowledgeService.retrieve(
      user,
      id,
      dto.query,
      dto.topK ?? 5,
      dto.threshold ?? 0.0,
    );
  }

  // ── 向量化任务 ─────────────────────────────────────────────

  @Get(':id/embedding-tasks')
  listEmbeddingTasks(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: QueryEmbeddingTaskDto,
  ) {
    return this.knowledgeService.listEmbeddingTasks(user, id, query);
  }

  @Get(':id/embedding-tasks/:taskId')
  getEmbeddingTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.knowledgeService.getEmbeddingTask(user, id, taskId);
  }
}
