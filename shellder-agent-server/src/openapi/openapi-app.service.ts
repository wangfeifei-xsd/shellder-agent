import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpenApiApp, Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { AuthUser } from '../auth/jwt.types';
import { PermissionService } from '../auth/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpenApiAppDto } from './dto/create-openapi-app.dto';
import { UpdateOpenApiAppDto } from './dto/update-openapi-app.dto';
import { QueryOpenApiAppDto } from './dto/query-openapi-app.dto';

@Injectable()
export class OpenApiAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async create(dto: CreateOpenApiAppDto, createdBy?: string) {
    await this.validateTenantIds(dto.allowedTenantIds);

    const clientId = this.generateClientId();
    const clientSecret = this.generateClientSecret();
    const clientSecretHash = this.hashSecret(clientSecret);

    try {
      const app = await this.prisma.openApiApp.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          clientId,
          clientSecretHash,
          allowedTenantIds: dto.allowedTenantIds,
          allowedCapabilities: dto.allowedCapabilities,
          rateLimitConfig: dto.rateLimitConfig
            ? (dto.rateLimitConfig as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          createdBy: createdBy ?? null,
        },
      });

      return {
        ...this.toView(app),
        clientId,
        clientSecret,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'APP_NAME_DUPLICATE',
          message: `应用名称已存在：${dto.name}`,
        });
      }
      throw err;
    }
  }

  async findMany(user: AuthUser, query: QueryOpenApiAppDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.OpenApiAppWhereInput = {};
    const and: Prisma.OpenApiAppWhereInput[] = [];

    const tenantScope = await this.buildTenantScopeFilter(user, query.tenantId);
    if (tenantScope) and.push(tenantScope);

    if (query.status) where.status = query.status;
    if (query.keyword) {
      and.push({
        OR: [
          { name: { contains: query.keyword } },
          { description: { contains: query.keyword } },
          { clientId: { contains: query.keyword } },
        ],
      });
    }
    if (and.length > 0) where.AND = and;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.openApiApp.count({ where }),
      this.prisma.openApiApp.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((a) => this.toView(a)), total, page, pageSize };
  }

  async findOne(id: string) {
    const app = await this.getOrThrow(id);
    return this.toView(app);
  }

  async update(id: string, dto: UpdateOpenApiAppDto) {
    await this.getOrThrow(id);

    if (dto.allowedTenantIds) {
      await this.validateTenantIds(dto.allowedTenantIds);
    }

    const data: Prisma.OpenApiAppUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.allowedTenantIds !== undefined) data.allowedTenantIds = dto.allowedTenantIds;
    if (dto.allowedCapabilities !== undefined) data.allowedCapabilities = dto.allowedCapabilities;
    if (dto.rateLimitConfig !== undefined) {
      data.rateLimitConfig = dto.rateLimitConfig
        ? (dto.rateLimitConfig as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    try {
      const updated = await this.prisma.openApiApp.update({ where: { id }, data });
      return this.toView(updated);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'APP_NAME_DUPLICATE',
          message: `应用名称已存在：${dto.name}`,
        });
      }
      throw err;
    }
  }

  async resetSecret(id: string) {
    await this.getOrThrow(id);
    const clientSecret = this.generateClientSecret();
    const clientSecretHash = this.hashSecret(clientSecret);

    const app = await this.prisma.openApiApp.update({
      where: { id },
      data: { clientSecretHash },
    });

    return {
      ...this.toView(app),
      clientSecret,
    };
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.prisma.openApiApp.delete({ where: { id } });
    return { ok: true };
  }

  async findByClientId(clientId: string): Promise<OpenApiApp | null> {
    return this.prisma.openApiApp.findUnique({ where: { clientId } });
  }

  verifySecret(app: OpenApiApp, secret: string): boolean {
    return app.clientSecretHash === this.hashSecret(secret);
  }

  async getOrThrow(id: string): Promise<OpenApiApp> {
    const app = await this.prisma.openApiApp.findUnique({ where: { id } });
    if (!app) {
      throw new NotFoundException({
        code: 'OPENAPI_APP_NOT_FOUND',
        message: `接入应用不存在：${id}`,
      });
    }
    return app;
  }

  /** 调用统计聚合（供调用日志页面摘要） */
  async getCallStats(appId: string) {
    const [total, success, failed, rateLimited] = await this.prisma.$transaction([
      this.prisma.openApiCallLog.count({ where: { appId } }),
      this.prisma.openApiCallLog.count({ where: { appId, status: 'success' } }),
      this.prisma.openApiCallLog.count({ where: { appId, status: 'failed' } }),
      this.prisma.openApiCallLog.count({ where: { appId, status: 'rate_limited' } }),
    ]);
    return {
      total,
      success,
      failed,
      rateLimited,
      successRate: total > 0 ? +(success / total * 100).toFixed(2) : 0,
      errorRate: total > 0 ? +(failed / total * 100).toFixed(2) : 0,
    };
  }

  /** 列表租户范围：指定 tenantId 时精确匹配；未指定时非超管限定在其绑定租户内 */
  private async buildTenantScopeFilter(
    user: AuthUser,
    requestedTenantId?: string,
  ): Promise<Prisma.OpenApiAppWhereInput | undefined> {
    const permissions = await this.permissionService.resolveForUser(user.id);

    if (requestedTenantId) {
      if (!permissions.isSuperAdmin && !(user.tenantIds ?? []).includes(requestedTenantId)) {
        throw new ForbiddenException({
          code: 'TENANT_FORBIDDEN',
          message: '无该租户的访问权限',
        });
      }
      return { allowedTenantIds: { array_contains: requestedTenantId } };
    }

    if (permissions.isSuperAdmin) return undefined;

    const allowed = user.tenantIds ?? [];
    if (allowed.length === 0) {
      return { id: { in: [] } };
    }
    return {
      OR: allowed.map((tenantId) => ({
        allowedTenantIds: { array_contains: tenantId },
      })),
    };
  }

  private async validateTenantIds(tenantIds: string[]) {
    if (tenantIds.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_TENANT_IDS',
        message: '至少需要配置一个允许访问的租户',
      });
    }
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true },
    });
    const found = new Set(tenants.map((t) => t.id));
    const missing = tenantIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_TENANT_IDS',
        message: `以下租户不存在：${missing.join(', ')}`,
      });
    }
  }

  private generateClientId(): string {
    return `sk_${randomBytes(16).toString('hex')}`;
  }

  private generateClientSecret(): string {
    return randomBytes(32).toString('hex');
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private toView(app: OpenApiApp) {
    return {
      id: app.id,
      name: app.name,
      description: app.description,
      clientId: app.clientId,
      status: app.status,
      allowedTenantIds: app.allowedTenantIds,
      allowedCapabilities: app.allowedCapabilities,
      rateLimitConfig: app.rateLimitConfig,
      lastCalledAt: app.lastCalledAt,
      createdBy: app.createdBy,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }
}
