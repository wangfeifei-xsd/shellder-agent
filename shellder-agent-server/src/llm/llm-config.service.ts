import { Injectable } from '@nestjs/common';
import { decryptSecret, encryptSecret } from '../connector/connector-secret.util';
import { SystemSettingsService } from '../system-settings/system-settings.service';

/** system_config 键：平台 LLM 接入（实施规格 §4） */
export const LLM_CONFIG_KEYS = {
  BASE_URL: 'llm.baseUrl',
  MODEL: 'llm.model',
  TIMEOUT_MS: 'llm.timeoutMs',
  MAX_TOKENS: 'llm.maxTokens',
  API_KEY_CIPHER: 'llm.apiKeyCipher',
  CHAT_PATH: 'llm.chatPath',
} as const;

const LLM_DEFAULTS: Record<string, string> = {
  [LLM_CONFIG_KEYS.BASE_URL]: '',
  [LLM_CONFIG_KEYS.MODEL]: '',
  [LLM_CONFIG_KEYS.TIMEOUT_MS]: '60000',
  [LLM_CONFIG_KEYS.MAX_TOKENS]: '4096',
  [LLM_CONFIG_KEYS.API_KEY_CIPHER]: '',
  [LLM_CONFIG_KEYS.CHAT_PATH]: 'v1/chat/completions',
};

export interface LlmEffectiveConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  chatPath: string;
  apiKey: string | null;
}

export interface LlmSettingsView {
  base_url: string;
  model: string;
  timeout_ms: number;
  max_tokens: number;
  chat_path: string;
  api_key_configured: boolean;
}

@Injectable()
export class LlmConfigService {
  constructor(private readonly settings: SystemSettingsService) {}

  async getSettingsView(): Promise<LlmSettingsView> {
    const [baseUrl, model, timeoutMs, maxTokens, chatPath, cipher] = await Promise.all([
      this.getRaw(LLM_CONFIG_KEYS.BASE_URL),
      this.getRaw(LLM_CONFIG_KEYS.MODEL),
      this.getRaw(LLM_CONFIG_KEYS.TIMEOUT_MS),
      this.getRaw(LLM_CONFIG_KEYS.MAX_TOKENS),
      this.getRaw(LLM_CONFIG_KEYS.CHAT_PATH),
      this.getRaw(LLM_CONFIG_KEYS.API_KEY_CIPHER),
    ]);
    return {
      base_url: baseUrl,
      model,
      timeout_ms: Number(timeoutMs) || 60_000,
      max_tokens: Number(maxTokens) || 4096,
      chat_path: chatPath || LLM_DEFAULTS[LLM_CONFIG_KEYS.CHAT_PATH],
      api_key_configured: Boolean(cipher?.trim()),
    };
  }

  async getEffectiveConfig(overrides?: Partial<LlmEffectiveConfig>): Promise<LlmEffectiveConfig> {
    const view = await this.getSettingsView();
    const cipher = await this.getRaw(LLM_CONFIG_KEYS.API_KEY_CIPHER);
    const secret = decryptSecret(cipher || null);
    const apiKey =
      typeof secret?.api_key === 'string' && secret.api_key.length > 0
        ? secret.api_key
        : null;

    return {
      baseUrl: overrides?.baseUrl ?? view.base_url,
      model: overrides?.model ?? view.model,
      timeoutMs: overrides?.timeoutMs ?? view.timeout_ms,
      maxTokens: overrides?.maxTokens ?? view.max_tokens,
      chatPath: overrides?.chatPath ?? view.chat_path,
      apiKey: overrides?.apiKey !== undefined ? overrides.apiKey : apiKey,
    };
  }

  isConfigured(config: LlmEffectiveConfig): boolean {
    return Boolean(config.baseUrl?.trim() && config.model?.trim() && config.apiKey);
  }

  async updateSettings(input: {
    base_url?: string;
    model?: string;
    timeout_ms?: number;
    max_tokens?: number;
    chat_path?: string;
    api_key?: string;
  }): Promise<LlmSettingsView> {
    const upserts: { configKey: string; configValue: string; description?: string }[] = [];

    if (input.base_url !== undefined) {
      upserts.push({
        configKey: LLM_CONFIG_KEYS.BASE_URL,
        configValue: input.base_url.trim(),
        description: 'LLM Base URL（OpenAI 兼容）',
      });
    }
    if (input.model !== undefined) {
      upserts.push({
        configKey: LLM_CONFIG_KEYS.MODEL,
        configValue: input.model.trim(),
        description: 'LLM 模型 ID',
      });
    }
    if (input.timeout_ms !== undefined) {
      upserts.push({
        configKey: LLM_CONFIG_KEYS.TIMEOUT_MS,
        configValue: String(input.timeout_ms),
        description: 'LLM Chat 单次超时（毫秒）',
      });
    }
    if (input.max_tokens !== undefined) {
      upserts.push({
        configKey: LLM_CONFIG_KEYS.MAX_TOKENS,
        configValue: String(input.max_tokens),
        description: 'LLM max_tokens',
      });
    }
    if (input.chat_path !== undefined) {
      upserts.push({
        configKey: LLM_CONFIG_KEYS.CHAT_PATH,
        configValue: input.chat_path.trim() || LLM_DEFAULTS[LLM_CONFIG_KEYS.CHAT_PATH],
        description: 'Chat Completions 相对路径',
      });
    }
    if (input.api_key !== undefined) {
      const trimmed = input.api_key.trim();
      upserts.push({
        configKey: LLM_CONFIG_KEYS.API_KEY_CIPHER,
        configValue: trimmed ? (encryptSecret({ api_key: trimmed }) ?? '') : '',
        description: 'LLM API Key（加密）',
      });
    }

    if (upserts.length > 0) {
      await this.settings.batchUpsert(upserts);
    }
    return this.getSettingsView();
  }

  private async getRaw(key: string): Promise<string> {
    const val = await this.settings.getConfigValue(key);
    if (val !== '') return val;
    return LLM_DEFAULTS[key] ?? '';
  }
}
