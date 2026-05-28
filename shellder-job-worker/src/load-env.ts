import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

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
