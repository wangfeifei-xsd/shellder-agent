import type { ApplicationConfig } from './application-config.types';

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

function str(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function num(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function section(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = raw[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 将 YAML 树绑定为强类型 ApplicationConfig */
export function bindApplicationConfig(
  raw: Record<string, unknown>,
  profile: string,
): ApplicationConfig {
  const infra = section(raw, 'infrastructure');
  const database = section(infra, 'database');
  const redis = section(infra, 'redis');

  const services = section(raw, 'services');
  const agentServer = section(services, 'agent-server');
  const jobWorker = section(services, 'job-worker');
  const webConsole = section(services, 'web-console');

  const auth = section(raw, 'auth');
  const jwt = section(auth, 'jwt');
  const connectorAuth = section(auth, 'connector');
  const bootstrap = section(auth, 'bootstrap');
  const worker = section(auth, 'worker');
  const openapi = section(auth, 'openapi');

  const app = section(raw, 'app');
  const platform = section(app, 'platform');
  const basic = section(app, 'basic');
  const capability = section(app, 'capability');
  const task = section(app, 'task');
  const sql = section(app, 'sql');
  const llm = section(app, 'llm');
  const model = section(app, 'model');
  const knowledge = section(app, 'knowledge');
  const notification = section(app, 'notification');
  const copilot = section(app, 'copilot');
  const prompt = section(app, 'prompt');
  const connectorApp = section(app, 'connector');
  const routing = section(app, 'routing');
  const query = section(app, 'query');

  const agentPort = num(agentServer.port, 3001);

  return {
    profile,
    infrastructure: {
      database: { url: str(database.url) },
      redis: {
        host: str(redis.host, 'localhost'),
        port: num(redis.port, 6379),
        password: str(redis.password),
      },
    },
    services: {
      agentServer: {
        port: agentPort,
        internalUrl:
          str(agentServer['internal-url']).replace(/\/+$/, '') ||
          `http://127.0.0.1:${agentPort}`,
      },
      jobWorker: { port: num(jobWorker.port, 3002) },
      webConsole: {
        port: num(webConsole.port, 3000),
        origin: str(webConsole.origin),
        apiBaseUrl: str(webConsole['api-base-url']),
        apiProxyTarget: str(webConsole['api-proxy-target'], `http://localhost:${agentPort}`),
        defaultOrigin: str(webConsole['default-origin'], 'http://localhost:3000'),
      },
    },
    auth: {
      jwt: {
        secret: str(jwt.secret, 'change-me-dev-secret'),
        expiresIn: str(jwt['expires-in'], '7d'),
      },
      connector: {
        secretKey: str(connectorAuth['secret-key']),
        devFallbackKey: str(
          connectorAuth['dev-fallback-key'],
          'shellder-agent-dev-connector-secret-key',
        ),
      },
      bootstrap: {
        enabled: parseBool(bootstrap.enabled, true),
      },
      worker: { internalToken: str(worker['internal-token']) },
      openapi: { tokenExpiresIn: str(openapi['token-expires-in'], '2h') },
    },
    app: {
      platform: { name: str(platform.name, 'shellder-agent') },
      basic: {
        defaultTimeoutMs: num(basic['default-timeout-ms'], 300_000),
        defaultPageSize: num(basic['default-page-size'], 20),
      },
      capability: {
        timeoutMinMs: num(capability['timeout-min-ms'], 30_000),
        timeoutFloorMs: num(capability['timeout-floor-ms'], 180_000),
        timeoutCeilingMs: num(capability['timeout-ceiling-ms'], 600_000),
        defaultMaxRetries: num(capability['default-max-retries'], 2),
        contextMessageLimit: num(capability['context-message-limit'], 20),
      },
      task: {
        defaultTimeoutMs: num(task['default-timeout-ms'], 300_000),
        defaultMaxRetries: num(task['default-max-retries'], 3),
      },
      sql: {
        maxRows: num(sql['max-rows'], 100),
        maxExecutionMs: num(sql['max-execution-ms'], 3000),
      },
      llm: {
        timeoutMs: num(llm['timeout-ms'], 60_000),
        maxTokens: num(llm['max-tokens'], 4096),
        chatPath: str(llm['chat-path'], 'chat/completions'),
        enableThinking: parseBool(llm['enable-thinking'], false),
      },
      model: {
        timeoutMs: num(model['timeout-ms'], 60_000),
        retryCount: num(model['retry-count'], 3),
        retryDelayMs: num(model['retry-delay-ms'], 1000),
        streamEnabled: parseBool(model['stream-enabled'], true),
        capabilityResponseTemplate: str(model['capability-response-template'], '{}'),
      },
      knowledge: {
        wikiBaseUrl: str(knowledge['wiki-base-url']),
        wikiTimeoutMs: num(knowledge['wiki-timeout-ms'], 30_000),
      },
      notification: {
        connectorId: str(notification['connector-id']),
        queueAttempts: num(notification['queue-attempts'], 3),
        queueBackoffDelayMs: num(notification['queue-backoff-delay-ms'], 3000),
        sendMock: parseBool(notification['send-mock'], true),
      },
      copilot: {
        maxHistoryMessages: num(copilot['max-history-messages'], 50),
        tokenTtlSeconds: num(copilot['token-ttl-seconds'], 3600),
      },
      prompt: { cacheTtlMs: num(prompt['cache-ttl-ms'], 60_000) },
      connector: { defaultTimeoutMs: num(connectorApp['default-timeout-ms'], 10_000) },
      routing: { llmClassifyEnabled: parseBool(routing['llm-classify-enabled'], false) },
      query: { resultMaxRowsForLlm: num(query['result-max-rows-for-llm'], 50) },
    },
  };
}
