import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KnowledgeBase, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { QueryKnowledgeBaseDto } from './dto/query-knowledge-base.dto';
import { CreateDataSourceDto } from './dto/create-data-source.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { QueryEmbeddingTaskDto } from './dto/query-embedding-task.dto';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  // ── 知识库 CRUD ────────────────────────────────────────────

  async create(user: AuthUser, dto: CreateKnowledgeBaseDto) {
    await this.assertTenantAccess(user, dto.tenantId);

    try {
      return await this.prisma.knowledgeBase.create({
        data: {
          tenantId: dto.tenantId,
          name: dto.name,
          description: dto.description ?? null,
          embeddingModel: dto.embeddingModel ?? 'text-embedding-3-small',
          similarityMetric: dto.similarityMetric ?? 'cosine',
          chunkStrategy: dto.chunkStrategy ?? 'fixed_size',
          chunkSize: dto.chunkSize ?? 500,
          chunkOverlap: dto.chunkOverlap ?? 50,
          createdBy: user.id,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException({
          code: 'KB_NAME_DUPLICATED',
          message: '同租户下已存在同名知识库',
        });
      }
      throw err;
    }
  }

  async findMany(user: AuthUser, query: QueryKnowledgeBaseDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.KnowledgeBaseWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
      deletedAt: null,
    };
    if (query.status) where.status = query.status as KnowledgeBase['status'];
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { description: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.knowledgeBase.count({ where }),
      this.prisma.knowledgeBase.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const kb = await this.getOrThrow(id);
    await this.assertTenantAccess(user, kb.tenantId);

    const [dataSourceCount, recentTasks] = await this.prisma.$transaction([
      this.prisma.kbDataSource.count({ where: { knowledgeBaseId: id } }),
      this.prisma.kbEmbeddingTask.findMany({
        where: { knowledgeBaseId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      ...kb,
      dataSourceCount,
      recentEmbeddingTasks: recentTasks,
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateKnowledgeBaseDto) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    const data: Prisma.KnowledgeBaseUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.embeddingModel !== undefined) data.embeddingModel = dto.embeddingModel;
    if (dto.similarityMetric !== undefined) data.similarityMetric = dto.similarityMetric;
    if (dto.chunkStrategy !== undefined) data.chunkStrategy = dto.chunkStrategy;
    if (dto.chunkSize !== undefined) data.chunkSize = dto.chunkSize;
    if (dto.chunkOverlap !== undefined) data.chunkOverlap = dto.chunkOverlap;
    if (dto.status !== undefined) data.status = dto.status;

    try {
      return await this.prisma.knowledgeBase.update({
        where: { id },
        data,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException({
          code: 'KB_NAME_DUPLICATED',
          message: '同租户下已存在同名知识库',
        });
      }
      throw err;
    }
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    await this.prisma.knowledgeBase.update({
      where: { id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    return { id };
  }

  // ── 数据源管理 ─────────────────────────────────────────────

  async addDataSource(
    user: AuthUser,
    kbId: string,
    dto: CreateDataSourceDto,
  ) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    return this.prisma.kbDataSource.create({
      data: {
        knowledgeBaseId: kbId,
        tenantId: kb.tenantId,
        name: dto.name,
        type: dto.type,
        config: dto.config ? (dto.config as Prisma.InputJsonValue) : Prisma.JsonNull,
        syncCron: dto.syncCron ?? null,
      },
    });
  }

  async listDataSources(user: AuthUser, kbId: string) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    return this.prisma.kbDataSource.findMany({
      where: { knowledgeBaseId: kbId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeDataSource(user: AuthUser, kbId: string, dsId: string) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    const ds = await this.prisma.kbDataSource.findUnique({ where: { id: dsId } });
    if (!ds || ds.knowledgeBaseId !== kbId) {
      throw new NotFoundException({
        code: 'DATA_SOURCE_NOT_FOUND',
        message: `数据源不存在：${dsId}`,
      });
    }

    await this.prisma.kbDataSource.delete({ where: { id: dsId } });
    return { id: dsId };
  }

  // ── 文档管理 ───────────────────────────────────────────────

  async uploadDocument(
    user: AuthUser,
    kbId: string,
    file: { title: string; content: string; fileKey?: string; fileSize?: number; mimeType?: string },
  ) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    const contentHash = this.simpleHash(file.content);
    const charCount = file.content.length;

    const doc = await this.prisma.kbDocument.create({
      data: {
        knowledgeBaseId: kbId,
        tenantId: kb.tenantId,
        title: file.title,
        fileKey: file.fileKey ?? null,
        fileSize: file.fileSize ?? null,
        mimeType: file.mimeType ?? null,
        contentHash,
        charCount,
        status: 'pending',
      },
    });

    // 异步启动分块处理
    void this.processDocument(kb, doc.id, file.content);

    return doc;
  }

  async listDocuments(
    user: AuthUser,
    kbId: string,
    query: QueryDocumentDto,
  ) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.KbDocumentWhereInput = { knowledgeBaseId: kbId };
    if (query.status) where.status = query.status as 'pending' | 'chunking' | 'embedding' | 'ready' | 'error';
    if (query.keyword) {
      where.title = { contains: query.keyword };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.kbDocument.count({ where }),
      this.prisma.kbDocument.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows, total, page, pageSize };
  }

  async removeDocument(user: AuthUser, kbId: string, docId: string) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    const doc = await this.prisma.kbDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.knowledgeBaseId !== kbId) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: `文档不存在：${docId}`,
      });
    }

    await this.prisma.kbDocument.delete({ where: { id: docId } });

    await this.refreshKbStats(kbId);

    return { id: docId };
  }

  // ── 向量检索 ───────────────────────────────────────────────

  async retrieve(
    user: AuthUser,
    kbId: string,
    query: string,
    topK: number = 5,
    threshold: number = 0.0,
  ) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    // V1: 简单文本匹配检索（embedding 需要 embedding 模型集成后才能做向量检索）
    // 生产环境应对接向量数据库做 ANN 近似最近邻检索
    const chunks = await this.prisma.kbChunk.findMany({
      where: {
        knowledgeBaseId: kbId,
        content: { contains: query },
      },
      orderBy: { chunkIndex: 'asc' },
      take: topK,
      include: {
        document: { select: { id: true, title: true } },
      },
    });

    return {
      query,
      topK,
      threshold,
      results: chunks.map((chunk) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        score: 1.0,
        metadata: chunk.metadata,
      })),
    };
  }

  // ── 向量化任务 ─────────────────────────────────────────────

  async listEmbeddingTasks(
    user: AuthUser,
    kbId: string,
    query: QueryEmbeddingTaskDto,
  ) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.KbEmbeddingTaskWhereInput = { knowledgeBaseId: kbId };
    if (query.status) where.status = query.status as 'queued' | 'running' | 'done' | 'failed';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.kbEmbeddingTask.count({ where }),
      this.prisma.kbEmbeddingTask.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          document: { select: { id: true, title: true } },
        },
      }),
    ]);

    return { items: rows, total, page, pageSize };
  }

  async getEmbeddingTask(user: AuthUser, kbId: string, taskId: string) {
    const kb = await this.getOrThrow(kbId);
    await this.assertTenantAccess(user, kb.tenantId);

    const task = await this.prisma.kbEmbeddingTask.findUnique({
      where: { id: taskId },
      include: {
        document: { select: { id: true, title: true, status: true } },
      },
    });
    if (!task || task.knowledgeBaseId !== kbId) {
      throw new NotFoundException({
        code: 'EMBEDDING_TASK_NOT_FOUND',
        message: `向量化任务不存在：${taskId}`,
      });
    }

    return task;
  }

  // ── 文档分块处理（内部） ───────────────────────────────────

  private async processDocument(
    kb: KnowledgeBase,
    docId: string,
    content: string,
  ) {
    const task = await this.prisma.kbEmbeddingTask.create({
      data: {
        knowledgeBaseId: kb.id,
        tenantId: kb.tenantId,
        documentId: docId,
        status: 'running',
        startedAt: new Date(),
      },
    });

    try {
      await this.prisma.kbDocument.update({
        where: { id: docId },
        data: { status: 'chunking' },
      });

      const chunks = this.chunkText(content, kb.chunkStrategy, kb.chunkSize, kb.chunkOverlap);

      await this.prisma.kbEmbeddingTask.update({
        where: { id: task.id },
        data: { totalChunks: chunks.length },
      });

      for (let i = 0; i < chunks.length; i++) {
        await this.prisma.kbChunk.create({
          data: {
            documentId: docId,
            knowledgeBaseId: kb.id,
            tenantId: kb.tenantId,
            content: chunks[i],
            tokenCount: Math.ceil(chunks[i].length / 4),
            chunkIndex: i,
            metadata: Prisma.JsonNull,
          },
        });

        await this.prisma.kbEmbeddingTask.update({
          where: { id: task.id },
          data: { processedChunks: i + 1 },
        });
      }

      await this.prisma.kbDocument.update({
        where: { id: docId },
        data: {
          status: 'embedding',
          chunkCount: chunks.length,
        },
      });

      // V1: embedding 阶段仅标记完成，实际向量化需集成 embedding 模型后实现
      await this.prisma.kbDocument.update({
        where: { id: docId },
        data: { status: 'ready' },
      });

      await this.prisma.kbEmbeddingTask.update({
        where: { id: task.id },
        data: {
          status: 'done',
          finishedAt: new Date(),
        },
      });

      await this.refreshKbStats(kb.id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.prisma.kbDocument.update({
        where: { id: docId },
        data: { status: 'error', errorMsg },
      }).catch(() => {});

      await this.prisma.kbEmbeddingTask.update({
        where: { id: task.id },
        data: { status: 'failed', errorMsg, finishedAt: new Date() },
      }).catch(() => {});
    }
  }

  private chunkText(
    content: string,
    strategy: string,
    size: number,
    overlap: number,
  ): string[] {
    if (strategy === 'paragraph') {
      return this.chunkByParagraph(content, size);
    }
    if (strategy === 'sentence') {
      return this.chunkBySentence(content, size);
    }
    return this.chunkByFixedSize(content, size, overlap);
  }

  private chunkByFixedSize(content: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < content.length) {
      const end = Math.min(start + size, content.length);
      chunks.push(content.slice(start, end));
      start = end - overlap;
      if (start >= content.length) break;
      if (end === content.length) break;
    }
    return chunks.filter((c) => c.trim().length > 0);
  }

  private chunkByParagraph(content: string, maxSize: number): string[] {
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if (current.length + para.length + 1 > maxSize && current.length > 0) {
        chunks.push(current.trim());
        current = '';
      }
      current += (current ? '\n\n' : '') + para;
    }
    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }
    return chunks;
  }

  private chunkBySentence(content: string, maxSize: number): string[] {
    const sentences = content.split(/(?<=[.。!！?？\n])\s*/).filter((s) => s.trim().length > 0);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > maxSize && current.length > 0) {
        chunks.push(current.trim());
        current = '';
      }
      current += (current ? ' ' : '') + sentence;
    }
    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }
    return chunks;
  }

  private async refreshKbStats(kbId: string) {
    const [docCount, chunkCount] = await this.prisma.$transaction([
      this.prisma.kbDocument.count({ where: { knowledgeBaseId: kbId } }),
      this.prisma.kbChunk.count({ where: { knowledgeBaseId: kbId } }),
    ]);
    await this.prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { documentCount: docCount, chunkCount },
    });
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const chr = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  // ── 内部辅助 ───────────────────────────────────────────────

  private async getOrThrow(id: string): Promise<KnowledgeBase> {
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb || kb.deletedAt) {
      throw new NotFoundException({
        code: 'KB_NOT_FOUND',
        message: `知识库不存在：${id}`,
      });
    }
    return kb;
  }

  private async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的知识库访问权限',
      });
    }
  }

  private async resolveTenantFilter(
    user: AuthUser,
    requestedTenantId?: string,
  ): Promise<string | Prisma.StringFilter | undefined> {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) {
      return requestedTenantId || undefined;
    }
    const allowed = user.tenantIds ?? [];
    if (requestedTenantId && allowed.includes(requestedTenantId)) {
      return requestedTenantId;
    }
    return { in: allowed };
  }
}
