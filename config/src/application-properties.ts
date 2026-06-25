import type { ApplicationConfig } from './application-config.types';
import { loadApplicationConfig } from './load-application-config';

class ApplicationPropertiesHolder {
  private config: ApplicationConfig | null = null;

  init(): ApplicationConfig {
    this.config = loadApplicationConfig();
    return this.config;
  }

  get(): ApplicationConfig {
    if (!this.config) {
      this.config = loadApplicationConfig();
    }
    return this.config;
  }

  resolveListenPort(
    service: 'agent-server' | 'job-worker',
    fallback: number,
  ): number {
    const fromPort = process.env.PORT;
    if (fromPort !== undefined && fromPort !== '') {
      const parsed = Number(fromPort);
      if (Number.isFinite(parsed)) return parsed;
    }
    const cfg = this.get();
    return service === 'agent-server'
      ? cfg.services.agentServer.port
      : cfg.services.jobWorker.port || fallback;
  }

  getRedisConnection() {
    const redis = this.get().infrastructure.redis;
    return {
      host: redis.host,
      port: redis.port,
      ...(redis.password ? { password: redis.password } : {}),
      maxRetriesPerRequest: null as null,
    };
  }

  getWebConsoleCorsOrigin(): string | true {
    const origin = this.get().services.webConsole.origin;
    return origin || true;
  }

  getSystemConfigDefaults(): Record<string, string> {
    const { app } = this.get();
    return {
      'basic.platformName': app.platform.name,
      'basic.platformLogo': '',
      'basic.defaultTimeoutMs': String(app.basic.defaultTimeoutMs),
      'basic.defaultPageSize': String(app.basic.defaultPageSize),
      'model.streamEnabled': app.model.streamEnabled ? 'true' : 'false',
      'model.timeoutMs': String(app.model.timeoutMs),
      'model.retryCount': String(app.model.retryCount),
      'model.retryDelayMs': String(app.model.retryDelayMs),
      'model.capabilityResponseTemplate': app.model.capabilityResponseTemplate,
      'notification.connectorId': app.notification.connectorId,
      'knowledge.wikiBaseUrl': app.knowledge.wikiBaseUrl,
      'knowledge.wikiTimeoutMs': String(app.knowledge.wikiTimeoutMs),
    };
  }

  getLlmConfigDefaults(): Record<string, string> {
    const { llm } = this.get().app;
    return {
      'llm.baseUrl': '',
      'llm.model': '',
      'llm.timeoutMs': String(llm.timeoutMs),
      'llm.maxTokens': String(llm.maxTokens),
      'llm.apiKeyCipher': '',
      'llm.chatPath': llm.chatPath,
      'llm.enableThinking': llm.enableThinking ? 'true' : 'false',
    };
  }
}

export const applicationProperties = new ApplicationPropertiesHolder();

export function loadEnvFiles(): void {
  applicationProperties.init();
}
