import { Logger } from '@nestjs/common';
import { applicationProperties } from '@shellder/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * 连接器凭证加解密（阶段 06）。
 *
 * 约束：连接器配置中的敏感字段（口令 / 令牌 / 密钥）不得明文落库（功能清单 §1.6、
 * 实施规格 安全要求）。本工具用 AES-256-GCM 对凭证 JSON 整体加密后存入
 * `connector.config.secretCipher`，详情接口仅回显脱敏摘要，禁止回传明文。
 *
 * 密钥来源：环境变量 CONNECTOR_SECRET_KEY（生产必须配置高强度随机串）。
 * 实际 32 字节密钥由该值经 SHA-256 派生，便于使用任意长度的口令式密钥。
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 96bit IV
const PREFIX = 'v1:'; // 密文版本前缀，便于后续轮换算法

const logger = new Logger('ConnectorSecret');
let warnedFallback = false;

function resolveKey(): Buffer {
  const auth = applicationProperties.get().auth.connector;
  const raw = auth.secretKey;
  if (!raw) {
    if (!warnedFallback) {
      logger.warn(
        '未配置 CONNECTOR_SECRET_KEY，使用开发期默认密钥；生产环境必须配置高强度随机密钥。',
      );
      warnedFallback = true;
    }
    return createHash('sha256').update(auth.devFallbackKey).digest();
  }
  return createHash('sha256').update(raw).digest();
}

/** 加密凭证对象 → 版本化密文字符串；空对象返回 null（无凭证不存密文）。 */
export function encryptSecret(secret: Record<string, unknown> | null | undefined): string | null {
  if (!secret || Object.keys(secret).length === 0) return null;
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(secret), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 布局：iv | tag | ciphertext，整体 base64
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return `${PREFIX}${payload}`;
}

/** 解密密文字符串 → 凭证对象；无密文或解密失败返回 null（不抛出，避免阻断主流程）。 */
export function decryptSecret(cipherText: string | null | undefined): Record<string, unknown> | null {
  if (!cipherText || !cipherText.startsWith(PREFIX)) return null;
  try {
    const key = resolveKey();
    const raw = Buffer.from(cipherText.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
  } catch (err) {
    logger.warn(`连接器凭证解密失败：${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** 生成凭证脱敏摘要：仅保留键名，值统一掩码，供详情接口安全回显。 */
export function maskSecret(secret: Record<string, unknown> | null): Record<string, string> {
  if (!secret) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(secret)) {
    out[key] = '******';
  }
  return out;
}
