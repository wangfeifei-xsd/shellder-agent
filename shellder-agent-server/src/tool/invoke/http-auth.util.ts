import { Connector } from '@prisma/client';
import { decryptSecret } from '../../connector/connector-secret.util';

/** 从连接器凭证构建 HTTP 认证头 */
export function buildAuthHeaders(connector: Connector): Record<string, string> {
  const secret = decryptSecret(
    (connector.config as { secretCipher?: string | null })?.secretCipher,
  );
  const headers: Record<string, string> = {};
  if (!secret) return headers;

  switch (connector.authType) {
    case 'basic': {
      const u = String(secret.username ?? '');
      const p = String(secret.password ?? '');
      headers.Authorization = `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
      break;
    }
    case 'bearer':
      if (secret.token) headers.Authorization = `Bearer ${String(secret.token)}`;
      break;
    case 'api_key': {
      const name = String(secret.headerName ?? 'X-API-Key');
      if (secret.apiKey) headers[name] = String(secret.apiKey);
      break;
    }
    case 'custom':
      for (const [k, v] of Object.entries(secret)) {
        if (k.startsWith('header.')) headers[k.slice('header.'.length)] = String(v);
      }
      break;
    default:
      break;
  }
  return headers;
}

/** 回显请求头时脱敏 Authorization / 密钥头 */
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /authorization|key|token|secret/i.test(k) ? '******' : v;
  }
  return out;
}

export function joinUrl(base: string, path: string): string {
  if (!path) return base;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
