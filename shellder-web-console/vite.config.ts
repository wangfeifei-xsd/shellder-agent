import path from 'node:path';
import react from '@vitejs/plugin-react';
import { applicationProperties, loadEnvFiles } from '@shellder/config';
import { defineConfig } from 'vite';

function buildWebConfig() {
  loadEnvFiles();
  const web = applicationProperties.get().services.webConsole;
  const app = applicationProperties.get().app;
  return {
    apiBaseUrl: web.apiBaseUrl,
    apiProxyTarget: web.apiProxyTarget,
    webConsoleOrigin: web.defaultOrigin,
    webConsolePort: web.port,
    sqlMaxRows: app.sql.maxRows,
    sqlMaxExecutionMs: app.sql.maxExecutionMs,
    defaultTimeoutMs: app.basic.defaultTimeoutMs,
    defaultPageSize: app.basic.defaultPageSize,
  };
}

export default defineConfig(() => {
  const webConfig = buildWebConfig();

  return {
    plugins: [react()],
    base: '/shellder/',
    define: {
      __SHELLDER_WEB_CONFIG__: JSON.stringify(webConfig),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: webConfig.webConsolePort,
      proxy: {
        '/api': {
          target: webConfig.apiProxyTarget,
          changeOrigin: true,
        },
        '/copilot/v1': {
          target: webConfig.apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'shellder',
      sourcemap: false,
    },
  };
});
