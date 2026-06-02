import { BadRequestException } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { createConnection, Connection } from 'mysql2/promise';
import { decryptSecret } from './connector-secret.util';
import { ConnectorConfig } from './connector.types';

/** 解析后的 MySQL 连接参数（db_readonly） */
export interface DbConnectionParams {
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  connectTimeoutMs: number;
}

/** host:port + database 三元组（租户内唯一校验） */
export interface DbEndpoint {
  host: string;
  port: number;
  database: string;
}

export function parseDbTarget(target: string): { host: string; port: number } {
  const cleaned = target.replace(/^[a-z]+:\/\//i, '').split('/')[0];
  const idx = cleaned.lastIndexOf(':');
  if (idx <= 0) {
    throw new BadRequestException({
      code: 'CONNECTOR_TARGET_INVALID',
      message: `连接器目标格式无效（应为 host:port）：${target}`,
    });
  }
  const host = cleaned.slice(0, idx);
  const port = Number(cleaned.slice(idx + 1));
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new BadRequestException({
      code: 'CONNECTOR_TARGET_INVALID',
      message: `连接器目标格式无效（应为 host:port）：${target}`,
    });
  }
  return { host, port };
}

export function readConnectorConfig(connector: Connector): ConnectorConfig {
  const raw = connector.config;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const c = raw as Partial<ConnectorConfig>;
    return {
      properties: c.properties ?? {},
      allowedToolScopes: c.allowedToolScopes ?? [],
      secretCipher: c.secretCipher ?? null,
    };
  }
  return { properties: {}, allowedToolScopes: [], secretCipher: null };
}

export function requireDatabase(properties: Record<string, unknown>): string {
  const database = str(properties.database);
  if (!database) {
    throw new BadRequestException({
      code: 'CONNECTOR_DATABASE_REQUIRED',
      message: '只读数据库连接器须在 properties.database 中配置逻辑库名',
    });
  }
  return database;
}

export function resolveDbEndpoint(
  target: string,
  properties: Record<string, unknown>,
): DbEndpoint {
  const { host, port } = parseDbTarget(target);
  return { host, port, database: requireDatabase(properties) };
}

export function resolveDbConnectionParams(connector: Connector): DbConnectionParams {
  if (connector.type !== 'db_readonly') {
    throw new BadRequestException({
      code: 'CONNECTOR_NOT_DB_READONLY',
      message: '仅 db_readonly 连接器支持数据库连接',
    });
  }
  const config = readConnectorConfig(connector);
  const { host, port } = parseDbTarget(connector.target);
  const database = requireDatabase(config.properties);
  const secret = decryptSecret(config.secretCipher);
  return {
    host,
    port,
    database,
    user: str(secret?.username) || str(config.properties.username) || undefined,
    password: str(secret?.password) || undefined,
    connectTimeoutMs: connector.timeoutMs ?? 5000,
  };
}

/** 创建 mysql2 连接（调用方负责 end） */
export async function openDbConnection(
  params: DbConnectionParams,
): Promise<Connection> {
  return createConnection({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database,
    connectTimeout: params.connectTimeoutMs,
    multipleStatements: false,
  });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
