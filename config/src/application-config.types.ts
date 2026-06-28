export interface ApplicationConfig {
  profile: string;
  infrastructure: {
    database: { url: string };
    redis: { host: string; port: number; password: string };
  };
  services: {
    agentServer: { port: number; internalUrl: string };
    jobWorker: { port: number };
    webConsole: {
      port: number;
      origin: string;
      apiBaseUrl: string;
      apiProxyTarget: string;
      defaultOrigin: string;
    };
  };
  auth: {
    jwt: { secret: string; expiresIn: string };
    connector: { secretKey: string; devFallbackKey: string };
    bootstrap: { enabled: boolean };
    worker: { internalToken: string };
    openapi: { tokenExpiresIn: string };
  };
  app: {
    platform: { name: string };
    basic: { defaultTimeoutMs: number; defaultPageSize: number };
    capability: {
      timeoutMinMs: number;
      timeoutFloorMs: number;
      timeoutCeilingMs: number;
      defaultMaxRetries: number;
      contextMessageLimit: number;
    };
    task: { defaultTimeoutMs: number; defaultMaxRetries: number };
    sql: { maxRows: number; maxExecutionMs: number };
    llm: {
      timeoutMs: number;
      maxTokens: number;
      chatPath: string;
      enableThinking: boolean;
    };
    model: {
      timeoutMs: number;
      retryCount: number;
      retryDelayMs: number;
      streamEnabled: boolean;
      capabilityResponseTemplate: string;
    };
    knowledge: { wikiBaseUrl: string; wikiTimeoutMs: number };
    notification: {
      connectorId: string;
      queueAttempts: number;
      queueBackoffDelayMs: number;
      sendMock: boolean;
    };
    copilot: { maxHistoryMessages: number; tokenTtlSeconds: number };
    prompt: { cacheTtlMs: number };
    connector: { defaultTimeoutMs: number };
    routing: { llmClassifyEnabled: boolean };
    query: { resultMaxRowsForLlm: number };
  };
}
