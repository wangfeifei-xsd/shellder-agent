import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/** 从 monorepo 根加载环境：本地 .env 可覆盖，否则使用 .env.example（与 Docker/Jenkins 一致） */
export function loadEnvFiles(): void {
  const roots = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(__dirname, '../..'),
  ];
  const names = ['.env', '.env.example'];

  for (const root of roots) {
    for (const name of names) {
      const envPath = resolve(root, name);
      if (existsSync(envPath)) {
        config({ path: envPath });
        return;
      }
    }
  }
}

loadEnvFiles();
