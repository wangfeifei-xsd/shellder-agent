import { ConnectorType } from '@prisma/client';

/** 支持的认证方式（具体凭证字段存于加密 secret 中） */
export const AUTH_TYPES = ['none', 'basic', 'bearer', 'api_key', 'custom'] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

/**
 * connector.config 的内部归一化结构。
 * - properties：非敏感的类型相关配置（如 db 的 host/port/database/username、http 的固定 header）。
 * - allowedToolScopes：可被哪些 Tool 引用（工具范围 key；07 工具按此校验绑定）。
 * - secretCipher：AES-256-GCM 加密后的凭证 JSON 字符串；无凭证为 null。
 */
export interface ConnectorConfig {
  properties: Record<string, unknown>;
  allowedToolScopes: string[];
  secretCipher: string | null;
}

export const EMPTY_CONNECTOR_CONFIG: ConnectorConfig = {
  properties: {},
  allowedToolScopes: [],
  secretCipher: null,
};

/** 连通性测试结果（应用层） */
export interface ConnectivityResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  message: string;
}

/** 连接器目标解析（db_readonly 的 host:port 解析） */
export interface DbTarget {
  host: string;
  port: number;
}

export const CONNECTOR_TYPE_LABEL: Record<ConnectorType, string> = {
  db_readonly: '只读数据库',
  http: 'HTTP API',
  notification: '消息通知接口',
};
