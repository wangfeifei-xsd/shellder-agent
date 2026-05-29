/** 审计采集请求头：管理后台顶栏「当前操作租户」（用于用户操作审计的 tenant_id 归属） */
export const ACTIVE_TENANT_HEADER = 'x-active-tenant-id';

/** body 中需脱敏、不落库的敏感字段 */
export const SENSITIVE_FIELDS = ['password', 'passwordHash', 'token', 'secret', 'accessToken'];

/** 截断过长摘要文本 */
export function truncate(value: string, max = 1000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** 移除对象中的敏感字段，用于审计 diff 落库 */
export function sanitize(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((item) => sanitize(item));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.includes(key)) {
      out[key] = '***';
    } else if (value && typeof value === 'object') {
      out[key] = sanitize(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
