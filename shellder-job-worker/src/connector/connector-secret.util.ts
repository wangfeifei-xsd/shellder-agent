import { createDecipheriv, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'v1:';
const DEV_FALLBACK_KEY = 'shellder-agent-dev-connector-secret-key';

function resolveKey(): Buffer {
  const raw = process.env.CONNECTOR_SECRET_KEY;
  if (!raw?.trim()) {
    return createHash('sha256').update(DEV_FALLBACK_KEY).digest();
  }
  return createHash('sha256').update(raw).digest();
}

export function decryptSecret(cipherText?: string | null): Record<string, unknown> | null {
  if (!cipherText?.startsWith(PREFIX)) return null;
  try {
    const payload = Buffer.from(cipherText.slice(PREFIX.length), 'base64');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv(ALGORITHM, resolveKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildAuthHeaders(
  authType: string,
  secret: Record<string, unknown> | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!secret) return headers;

  switch (authType) {
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
    default:
      break;
  }
  return headers;
}
