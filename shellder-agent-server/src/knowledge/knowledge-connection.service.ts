import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CONFIG_KEYS,
  SystemSettingsService,
} from '../system-settings/system-settings.service';
import { UpsertKnowledgeConnectionDto } from './dto/upsert-knowledge-connection.dto';
import { knowledgeProxyUnavailable } from './knowledge-proxy.errors';

const LEGACY_WIKI_BASE_KEY = 'knowledge.pathyBaseUrl';
const LEGACY_WIKI_TIMEOUT_KEY = 'knowledge.pathyTimeoutMs';

export interface KnowledgeConnectionSettings {
  wikiBaseUrl: string;
  wikiTimeoutMs: number;
  /** 是否已在 MySQL system_config 中配置 wiki 地址 */
  configured: boolean;
}

@Injectable()
export class KnowledgeConnectionService {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  async getSettingsForAdmin(): Promise<KnowledgeConnectionSettings> {
    const wikiBaseUrl = (await this.readWikiBaseUrl()).trim();
    const wikiTimeoutMs = this.parseTimeoutMs(await this.readWikiTimeoutRaw());
    return {
      wikiBaseUrl,
      wikiTimeoutMs,
      configured: !!wikiBaseUrl,
    };
  }

  async upsertSettings(dto: UpsertKnowledgeConnectionDto): Promise<KnowledgeConnectionSettings> {
    const url = dto.wikiBaseUrl.trim().replace(/\/+$/, '');
    if (!url) {
      throw new BadRequestException({
        code: 'INVALID_WIKI_URL',
        message: 'wiki 服务地址不能为空',
      });
    }
    const timeoutMs = dto.wikiTimeoutMs ?? 30_000;
    await this.systemSettings.batchUpsert([
      {
        configKey: CONFIG_KEYS.KNOWLEDGE_WIKI_BASE_URL,
        configValue: url,
        description: 'wiki 知识库服务根 URL（知识库管理配置）',
      },
      {
        configKey: CONFIG_KEYS.KNOWLEDGE_WIKI_TIMEOUT_MS,
        configValue: String(timeoutMs),
        description: 'wiki 代理 HTTP 超时（毫秒）',
      },
    ]);
    return this.getSettingsForAdmin();
  }

  async resolveBaseUrl(): Promise<string> {
    const db = (await this.readWikiBaseUrl()).trim();
    if (db) return db.replace(/\/+$/, '');
    throw knowledgeProxyUnavailable(
      '未配置 wiki 知识库服务地址，请在管理后台「知识库管理」中保存 wiki 服务连接',
    );
  }

  async resolveTimeoutMs(overrideMs?: number): Promise<number> {
    if (overrideMs != null && Number.isFinite(overrideMs) && overrideMs > 0) {
      return Math.trunc(overrideMs);
    }
    return this.parseTimeoutMs(await this.readWikiTimeoutRaw());
  }

  private async readWikiBaseUrl(): Promise<string> {
    const v = await this.systemSettings.getConfigValue(CONFIG_KEYS.KNOWLEDGE_WIKI_BASE_URL);
    if (v.trim()) return v;
    return this.systemSettings.getConfigValue(LEGACY_WIKI_BASE_KEY);
  }

  private async readWikiTimeoutRaw(): Promise<string> {
    const v = await this.systemSettings.getConfigValue(CONFIG_KEYS.KNOWLEDGE_WIKI_TIMEOUT_MS);
    if (v.trim()) return v;
    return this.systemSettings.getConfigValue(LEGACY_WIKI_TIMEOUT_KEY);
  }

  private parseTimeoutMs(raw: string | undefined): number {
    const n = Number(raw ?? 30_000);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 30_000;
  }
}
