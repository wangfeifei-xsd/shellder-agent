import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { applicationProperties } from '@shellder/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCopilotConfigDto, UpdateCopilotConfigDto } from './dto/copilot-config.dto';
import { AuthUser } from '../auth/jwt.types';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { mergeCopilotFeatures } from './copilot-routing.features';

@Injectable()
export class CopilotConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async create(user: AuthUser, dto: CreateCopilotConfigDto) {
    await this.tenantScope.assertAccess(user, dto.tenantId);

    const existing = await this.prisma.copilotConfig.findUnique({
      where: { appId: dto.appId },
    });
    if (existing) {
      throw new ConflictException({
        code: 'COPILOT_CONFIG_EXISTS',
        message: '该应用已存在 Copilot 配置',
      });
    }

    const app = await this.prisma.openApiApp.findUnique({ where: { id: dto.appId } });
    if (!app) {
      throw new NotFoundException({
        code: 'OPENAPI_APP_NOT_FOUND',
        message: `OpenAPI 应用不存在：${dto.appId}`,
      });
    }

    const config = await this.prisma.copilotConfig.create({
      data: {
        tenantId: dto.tenantId,
        appId: dto.appId,
        name: dto.name,
        domainWhitelist: dto.domainWhitelist ?? [],
        theme: (dto.theme ?? {}) as unknown as Prisma.InputJsonValue,
        features: (dto.features ?? mergeCopilotFeatures(undefined)) as unknown as Prisma.InputJsonValue,
        welcomeMessage: dto.welcomeMessage ?? null,
        placeholder: dto.placeholder ?? null,
        maxHistoryMessages:
          dto.maxHistoryMessages ?? applicationProperties.get().app.copilot.maxHistoryMessages,
        tokenTtlSeconds:
          dto.tokenTtlSeconds ?? applicationProperties.get().app.copilot.tokenTtlSeconds,
      },
    });
    return this.toView(config);
  }

  async findMany(user: AuthUser, tenantId?: string) {
    const where = await this.buildTenantFilter(user, tenantId);
    const configs = await this.prisma.copilotConfig.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { app: { select: { id: true, name: true, clientId: true, status: true } } },
    });
    return configs.map((c) => ({
      ...this.toView(c),
      app: c.app,
    }));
  }

  async findOne(user: AuthUser, id: string) {
    const config = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, config.tenantId);
    return this.toView(config);
  }

  async update(user: AuthUser, id: string, dto: UpdateCopilotConfigDto) {
    const config = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, config.tenantId);

    const data: Prisma.CopilotConfigUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.domainWhitelist !== undefined) data.domainWhitelist = dto.domainWhitelist;
    if (dto.theme !== undefined) data.theme = dto.theme as unknown as Prisma.InputJsonValue;
    if (dto.features !== undefined) {
      data.features = mergeCopilotFeatures({
        ...(typeof config.features === 'object' && config.features
          ? (config.features as Record<string, unknown>)
          : {}),
        ...dto.features,
      }) as unknown as Prisma.InputJsonValue;
    }
    if (dto.welcomeMessage !== undefined) data.welcomeMessage = dto.welcomeMessage;
    if (dto.placeholder !== undefined) data.placeholder = dto.placeholder;
    if (dto.maxHistoryMessages !== undefined) data.maxHistoryMessages = dto.maxHistoryMessages;
    if (dto.tokenTtlSeconds !== undefined) data.tokenTtlSeconds = dto.tokenTtlSeconds;

    const updated = await this.prisma.copilotConfig.update({ where: { id }, data });
    return this.toView(updated);
  }

  async delete(user: AuthUser, id: string) {
    const config = await this.getOrThrow(id);
    await this.tenantScope.assertAccess(user, config.tenantId);
    await this.prisma.copilotConfig.delete({ where: { id } });
  }

  async getConfigByAppId(appId: string) {
    const config = await this.prisma.copilotConfig.findUnique({ where: { appId } });
    if (!config) return null;
    return this.toView(config);
  }

  private async getOrThrow(id: string) {
    const config = await this.prisma.copilotConfig.findUnique({ where: { id } });
    if (!config) {
      throw new NotFoundException({
        code: 'COPILOT_CONFIG_NOT_FOUND',
        message: `Copilot 配置不存在：${id}`,
      });
    }
    return config;
  }

  private async buildTenantFilter(user: AuthUser, requestedTenantId?: string) {
    const filter = await this.tenantScope.resolveFilter(user, requestedTenantId);
    if (filter === undefined) return {};
    if (typeof filter === 'string') return { tenantId: filter };
    return { tenantId: filter };
  }

  private toView(config: any) {
    return {
      id: config.id,
      tenantId: config.tenantId,
      appId: config.appId,
      name: config.name,
      status: config.status,
      domainWhitelist: config.domainWhitelist,
      theme: config.theme,
      features: mergeCopilotFeatures(config.features),
      welcomeMessage: config.welcomeMessage,
      placeholder: config.placeholder,
      maxHistoryMessages: config.maxHistoryMessages,
      tokenTtlSeconds: config.tokenTtlSeconds,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
