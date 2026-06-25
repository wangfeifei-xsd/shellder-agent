import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationTemplateType, Prisma } from '@prisma/client';
import { SystemConfigKey, applicationProperties } from '@shellder/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/upsert-notification-template.dto';

/** @deprecated 使用 SystemConfigKey 枚举 */
export const CONFIG_KEYS = SystemConfigKey;

function getDefaultValues(): Record<string, string> {
  return applicationProperties.getSystemConfigDefaults();
}

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

    const defaults = Object.entries(getDefaultValues())
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

    for (const [key, defaultVal] of Object.entries(getDefaultValues())) {
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
    return row?.configValue ?? getDefaultValues()[key] ?? '';
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
