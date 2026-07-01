import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, PromptScope, PromptTemplate, PromptVersionState } from '@prisma/client';
import { AuthUser } from '../auth/jwt.types';
import { PermissionService } from '../auth/permission.service';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromptTemplateDto } from './dto/create-prompt-template.dto';
import { QueryPromptTemplateDto } from './dto/query-prompt-template.dto';
import { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';
import { promptKeyConflict, promptTemplateNotFound } from './prompt.errors';
import { sha256Content } from './prompt-render.util';

@Injectable()
export class PromptTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
    private readonly permissionService: PermissionService,
  ) {}

  async findMany(user: AuthUser, query: QueryPromptTemplateDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PromptTemplateWhereInput = {};

    if (query.category) where.category = query.category;
    if (query.role) where.role = query.role;
    if (query.scope) where.scope = query.scope;
    if (query.status) where.status = query.status;

    const perms = await this.permissionService.resolveForUser(user.id);
    const isSuper = perms.isSuperAdmin;
    if (query.tenantId) {
      if (!isSuper) {
        await this.tenantScope.assertAccess(user, query.tenantId, { forbiddenMessage: '无权访问该租户 Prompt 模板' });
      }
      where.tenantId = query.tenantId;
    } else if (!isSuper) {
      where.OR = [{ scope: PromptScope.global }, { tenantId: { in: await this.userTenantIds(user) } }];
    }

    if (query.keyword) {
      where.AND = [
        ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
        {
          OR: [
            { promptKey: { contains: query.keyword } },
            { name: { contains: query.keyword } },
            { description: { contains: query.keyword } },
          ],
        },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.promptTemplate.count({ where }),
      this.prisma.promptTemplate.findMany({
        where,
        orderBy: [{ category: 'asc' }, { promptKey: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          versions: {
            where: { state: PromptVersionState.published },
            take: 1,
          },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: items.map((t) => this.toListItem(t)),
    };
  }

  async findOne(user: AuthUser, id: string) {
    const template = await this.getTemplateOrThrow(id);
    await this.assertTemplateAccess(user, template);
    const published = await this.prisma.promptVersion.findFirst({
      where: { templateId: id, state: PromptVersionState.published },
    });
    const draft = await this.prisma.promptVersion.findFirst({
      where: { templateId: id, state: PromptVersionState.draft },
      orderBy: { version: 'desc' },
    });
    return {
      ...this.toDetail(template),
      publishedVersion: published
        ? { id: published.id, version: published.version, publishedAt: published.publishedAt }
        : null,
      draftVersion: draft ? { id: draft.id, version: draft.version } : null,
    };
  }

  async create(user: AuthUser, dto: CreatePromptTemplateDto) {
    if (dto.scope === PromptScope.tenant) {
      if (!dto.tenantId) {
        throw new BadRequestException('scope=tenant 时必须指定 tenantId');
      }
      await this.tenantScope.assertAccess(user, dto.tenantId, { forbiddenMessage: '无权访问该租户 Prompt 模板' });
    } else if (dto.tenantId) {
      throw new BadRequestException('scope=global 时不可指定 tenantId');
    }

    const existing = await this.prisma.promptTemplate.findFirst({
      where: {
        promptKey: dto.promptKey,
        scope: dto.scope,
        tenantId: dto.tenantId ?? null,
      },
    });
    if (existing) throw promptKeyConflict();

    const contentHash = sha256Content(dto.content);
    const template = await this.prisma.promptTemplate.create({
      data: {
        promptKey: dto.promptKey,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        role: dto.role,
        scope: dto.scope,
        tenantId: dto.tenantId ?? null,
        variableSchema: dto.variableSchema
          ? (dto.variableSchema as Prisma.InputJsonValue)
          : undefined,
        versions: {
          create: {
            version: 1,
            content: dto.content,
            contentHash,
            changelog: dto.changelog ?? '初始 draft',
            state: PromptVersionState.draft,
          },
        },
      },
      include: { versions: true },
    });
    return this.toDetail(template);
  }

  async update(user: AuthUser, id: string, dto: UpdatePromptTemplateDto) {
    const template = await this.getTemplateOrThrow(id);
    await this.assertTemplateAccess(user, template);
    const updated = await this.prisma.promptTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        variableSchema:
          dto.variableSchema === null
            ? Prisma.JsonNull
            : dto.variableSchema !== undefined
              ? (dto.variableSchema as Prisma.InputJsonValue)
              : undefined,
        status: dto.status,
      },
    });
    return this.toDetail(updated);
  }

  async getTemplateOrThrow(id: string): Promise<PromptTemplate> {
    const template = await this.prisma.promptTemplate.findUnique({ where: { id } });
    if (!template) throw promptTemplateNotFound();
    return template;
  }

  private toListItem(
    t: PromptTemplate & { versions: { version: number; id: string }[] },
  ) {
    const pub = t.versions[0];
    return {
      id: t.id,
      promptKey: t.promptKey,
      name: t.name,
      category: t.category,
      role: t.role,
      scope: t.scope,
      tenantId: t.tenantId,
      status: t.status,
      publishedVersion: pub?.version ?? null,
      publishedVersionId: pub?.id ?? null,
      updatedAt: t.updatedAt,
    };
  }

  private toDetail(t: PromptTemplate) {
    return {
      id: t.id,
      promptKey: t.promptKey,
      name: t.name,
      description: t.description,
      category: t.category,
      role: t.role,
      scope: t.scope,
      tenantId: t.tenantId,
      variableSchema: t.variableSchema,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async assertTemplateAccess(user: AuthUser, template: PromptTemplate) {
    if (template.scope === PromptScope.global) return;
    if (!template.tenantId) return;
    await this.tenantScope.assertAccess(user, template.tenantId, { forbiddenMessage: '无权访问该租户 Prompt 模板' });
  }

  private async userTenantIds(user: AuthUser): Promise<string[]> {
    const rows = await this.prisma.userTenant.findMany({
      where: { userId: user.id },
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }
}
