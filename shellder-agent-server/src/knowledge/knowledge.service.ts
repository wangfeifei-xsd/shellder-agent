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
import { throwSelfHostedDeprecated } from './knowledge-deprecation.util';

/**
 * 知识库租户绑定元数据（pathy 代理模式）。
 * 内容存储、召回、向量化由 pathy-knowledge-server 承担；本服务仅维护租户绑定与权限。
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async create(user: AuthUser, dto: CreateKnowledgeBaseDto) {
    await this.assertTenantAccess(user, dto.tenantId);

    try {
      return await this.prisma.knowledgeBase.create({
        data: {
          tenantId: dto.tenantId,
          name: dto.name,
          description: dto.description ?? null,
          pathyWikiPrefix: dto.pathyWikiPrefix ?? null,
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
          message: '同租户下已存在同名知识库绑定',
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
    return kb;
  }

  async update(user: AuthUser, id: string, dto: UpdateKnowledgeBaseDto) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    const data: Prisma.KnowledgeBaseUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.pathyWikiPrefix !== undefined) {
      data.pathyWikiPrefix = dto.pathyWikiPrefix || null;
    }
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
          message: '同租户下已存在同名知识库绑定',
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

  async addDataSource(
    _user: AuthUser,
    _kbId: string,
    _dto: CreateDataSourceDto,
  ) {
    throwSelfHostedDeprecated('数据源管理');
  }

  async listDataSources(_user: AuthUser, _kbId: string) {
    throwSelfHostedDeprecated('数据源列表');
  }

  async removeDataSource(_user: AuthUser, _kbId: string, _dsId: string) {
    throwSelfHostedDeprecated('数据源删除');
  }

  async uploadDocument(
    _user: AuthUser,
    _kbId: string,
    _file: { title: string; content: string },
  ) {
    throwSelfHostedDeprecated('文档上传');
  }

  async listDocuments(
    _user: AuthUser,
    _kbId: string,
    _query: QueryDocumentDto,
  ) {
    throwSelfHostedDeprecated('文档列表');
  }

  async removeDocument(_user: AuthUser, _kbId: string, _docId: string) {
    throwSelfHostedDeprecated('文档删除');
  }

  async retrieve(
    _user: AuthUser,
    _kbId: string,
    _query: string,
    _topK?: number,
    _threshold?: number,
  ) {
    throwSelfHostedDeprecated('平台内 kb_chunk 检索');
  }

  async listEmbeddingTasks(
    _user: AuthUser,
    _kbId: string,
    _query: QueryEmbeddingTaskDto,
  ) {
    throwSelfHostedDeprecated('向量化任务列表');
  }

  async getEmbeddingTask(_user: AuthUser, _kbId: string, _taskId: string) {
    throwSelfHostedDeprecated('向量化任务详情');
  }

  private async getOrThrow(id: string): Promise<KnowledgeBase> {
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb || kb.deletedAt) {
      throw new NotFoundException({
        code: 'KB_NOT_FOUND',
        message: `知识库绑定不存在：${id}`,
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
