declare const __SHELLDER_WEB_CONFIG__: {
  apiBaseUrl: string;
  apiProxyTarget: string;
  webConsoleOrigin: string;
  webConsolePort: number;
  sqlMaxRows: number;
  sqlMaxExecutionMs: number;
  defaultTimeoutMs: number;
  defaultPageSize: number;
} | undefined;

const injected = typeof __SHELLDER_WEB_CONFIG__ !== 'undefined' ? __SHELLDER_WEB_CONFIG__ : undefined;

export const webEnvConfig = {
  apiBaseUrl: injected?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '',
  apiProxyTarget: injected?.apiProxyTarget ?? 'http://localhost:3001',
  webConsoleOrigin: injected?.webConsoleOrigin ?? 'http://localhost:3000',
  webConsolePort: injected?.webConsolePort ?? 3000,
  sqlMaxRows: injected?.sqlMaxRows ?? 100,
  sqlMaxExecutionMs: injected?.sqlMaxExecutionMs ?? 3000,
  defaultTimeoutMs: injected?.defaultTimeoutMs ?? 300_000,
  defaultPageSize: injected?.defaultPageSize ?? 20,
};
