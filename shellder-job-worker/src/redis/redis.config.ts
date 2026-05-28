import type { ConnectionOptions } from 'bullmq';

export function getRedisConnection(): ConnectionOptions {
  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = Number(process.env.REDIS_PORT ?? 6379);
  const password = process.env.REDIS_PASSWORD;

  return {
    host,
    port,
    ...(password ? { password } : {}),
    maxRetriesPerRequest: null,
  };
}
