import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationTemplateType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/upsert-notification-template.dto';

/**
 * 系统配置 configKey 常量。
 * Runtime / job-worker 读取时使用同样的 key。
 */
export const CONFIG_KEYS = {
  PLATFORM_NAME: 'basic.platformName',
  PLATFORM_LOGO: 'basic.platformLogo',
  DEFAULT_TIMEOUT_MS: 'basic.defaultTimeoutMs',
  DEFAULT_PAGE_SIZE: 'basic.defaultPageSize',

  STREAM_ENABLED: 'model.streamEnabled',
  MODEL_TIMEOUT_MS: 'model.timeoutMs',
  MODEL_RETRY_COUNT: 'model.retryCount',
  MODEL_RETRY_DELAY_MS: 'model.retryDelayMs',
  CAPABILITY_RESPONSE_TEMPLATE: 'model.capabilityResponseTemplate',

  NOTIFICATION_CONNECTOR_ID: 'notification.connectorId',
} as const;

/** 默认配置值 */
const DEFAULT_VALUES: Record<string, string> = {
  [CONFIG_KEYS.PLATFORM_NAME]: 'shellder-agent',
  [CONFIG_KEYS.PLATFORM_LOGO]: '',
  [CONFIG_KEYS.DEFAULT_TIMEOUT_MS]: '300000',
  [CONFIG_KEYS.DEFAULT_PAGE_SIZE]: '20',
  [CONFIG_KEYS.STREAM_ENABLED]: 'true',
  [CONFIG_KEYS.MODEL_TIMEOUT_MS]: '60000',
  [CONFIG_KEYS.MODEL_RETRY_COUNT]: '3',
  [CONFIG_KEYS.MODEL_RETRY_DELAY_MS]: '1000',
  [CONFIG_KEYS.CAPABILITY_RESPONSE_TEMPLATE]: '{}',
  [CONFIG_KEYS.NOTIFICATION_CONNECTOR_ID]: '',
};

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 配置 CRUD ──────────────────────────────────────────

  /** 按分组获取所有配置（合并默认值） */
  async getConfigsByGroup(group: string) {
    const rows = await this.prisma.systemConfig.findMany({
      where: { configGroup: group },
      orderBy: { configKey: 'asc' },
    });
    const map = new Map(rows.map((r) => [r.configKey, r]));

    const defaults = Object.entries(DEFAULT_VALUES)
      .filter(([k]) => k.startsWith(`${group}.`))
      .map(([k, v]) => ({
        configKey: k,
        configValue: map.get(k)?.configValue ?? v,
        description: map.get(k)?.description ?? null,
        updatedAt: map.get(k)?.updatedAt ?? null,
      }));

    return defaults.length > 0 ? defaults : rows.map((r) => ({
      configKey: r.configKey,
      configValue: r.configValue,
      description: r.description,
      updatedAt: r.updatedAt,
    }));
  }

  /** 获取所有配置 */
  async getAllConfigs() {
    const rows = await this.prisma.systemConfig.findMany({
      orderBy: { configKey: 'asc' },
    });
    const map = new Map(rows.map((r) => [r.configKey, r]));

    const result: Record<string, { configValue: string; description: string | null; updatedAt: Date | null }> = {};

    for (const [key, defaultVal] of Object.entries(DEFAULT_VALUES)) {
      const existing = map.get(key);
      result[key] = {
        configValue: existing?.configValue ?? defaultVal,
        description: existing?.description ?? null,
        updatedAt: existing?.updatedAt ?? null,
      };
    }

    for (const row of rows) {
      if (!result[row.configKey]) {
        result[row.configKey] = {
          configValue: row.configValue,
          description: row.description,
          updatedAt: row.updatedAt,
        };
      }
    }

    return result;
  }

  /** 获取单个配置值（未持久化时返回默认值） */
  async getConfigValue(key: string): Promise<string> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { configKey: key },
    });
    return row?.configValue ?? DEFAULT_VALUES[key] ?? '';
  }

  /** 写入/更新单条配置 */
  async upsertConfig(dto: UpsertConfigDto) {
    const group = dto.configKey.split('.')[0] ?? 'basic';
    return this.prisma.systemConfig.upsert({
      where: { configKey: dto.configKey },
      update: {
        configValue: dto.configValue,
        description: dto.description ?? undefined,
      },
      create: {
        configGroup: group,
        configKey: dto.configKey,
        configValue: dto.configValue,
        description: dto.description ?? null,
      },
    });
  }

  /** 批量写入配置 */
  async batchUpsert(items: UpsertConfigDto[]) {
    return this.prisma.$transaction(
      items.map((dto) => {
        const group = dto.configKey.split('.')[0] ?? 'basic';
        return this.prisma.systemConfig.upsert({
          where: { configKey: dto.configKey },
          update: {
            configValue: dto.configValue,
            description: dto.description ?? undefined,
          },
          create: {
            configGroup: group,
            configKey: dto.configKey,
            configValue: dto.configValue,
            description: dto.description ?? null,
          },
        });
      }),
    );
  }

  // ── 通知模板 CRUD ──────────────────────────────────────

  async listTemplates(type?: NotificationTemplateType) {
    const where: Prisma.NotificationTemplateWhereInput = {};
    if (type) where.type = type;
    return this.prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(id: string) {
    const tpl = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: `通知模板不存在：${id}` });
    return tpl;
  }

  async createTemplate(dto: CreateNotificationTemplateDto) {
    return this.prisma.notificationTemplate.create({
      data: {
        type: dto.type,
        name: dto.name,
        subject: dto.subject ?? null,
        body: dto.body,
        enabled: dto.enabled ?? true,
        connectorId: dto.connectorId ?? null,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateNotificationTemplateDto) {
    await this.getTemplate(id);
    const data: Prisma.NotificationTemplateUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.subject !== undefined) data.subject = dto.subject || null;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.connectorId !== undefined) data.connectorId = dto.connectorId || null;
    return this.prisma.notificationTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    return this.prisma.notificationTemplate.delete({ where: { id } });
  }
}
