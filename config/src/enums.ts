/** 运行 Profile；Docker 部署时加载 application-{profile}.yml.dockeruse */
export enum AppProfile {
  DEFAULT = 'default',
  LOCAL = 'local',
  PROD = 'prod',
}

/** system_config 表 config_key */
export enum SystemConfigKey {
  PLATFORM_NAME = 'basic.platformName',
  PLATFORM_LOGO = 'basic.platformLogo',
  DEFAULT_TIMEOUT_MS = 'basic.defaultTimeoutMs',
  DEFAULT_PAGE_SIZE = 'basic.defaultPageSize',

  STREAM_ENABLED = 'model.streamEnabled',
  MODEL_TIMEOUT_MS = 'model.timeoutMs',
  MODEL_RETRY_COUNT = 'model.retryCount',
  MODEL_RETRY_DELAY_MS = 'model.retryDelayMs',
  CAPABILITY_RESPONSE_TEMPLATE = 'model.capabilityResponseTemplate',

  NOTIFICATION_CONNECTOR_ID = 'notification.connectorId',

  KNOWLEDGE_WIKI_BASE_URL = 'knowledge.wikiBaseUrl',
  KNOWLEDGE_WIKI_TIMEOUT_MS = 'knowledge.wikiTimeoutMs',
}

/**
 * 平台 LLM 接入 system_config 键（实施规格 §4）。
 */
export enum LlmConfigKey {
  BASE_URL = 'llm.baseUrl',
  MODEL = 'llm.model',
  TIMEOUT_MS = 'llm.timeoutMs',
  MAX_TOKENS = 'llm.maxTokens',
  API_KEY_CIPHER = 'llm.apiKeyCipher',
  CHAT_PATH = 'llm.chatPath',
  ENABLE_THINKING = 'llm.enableThinking',
}
