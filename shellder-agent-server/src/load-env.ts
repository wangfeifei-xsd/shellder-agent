import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/** 从 monorepo 根或当前包目录加载 .env（npm -w 时 cwd 常在子包内） */
export function loadEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(__dirname, '../.env'),
    resolve(__dirname, '../../.env'),
  ];

  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      config({ path: envPath });
      return;
    }
  }
}

loadEnvFiles();
