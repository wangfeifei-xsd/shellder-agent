import type { ConnectionOptions } from 'bullmq';
import { applicationProperties } from '@shellder/config';

export function getRedisConnection(): ConnectionOptions {
  return applicationProperties.getRedisConnection();
}
