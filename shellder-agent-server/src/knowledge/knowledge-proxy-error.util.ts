/**
 * 将 pathy / FastAPI 上游错误体格式化为可读字符串。
 * FastAPI 422 的 detail 常为 { loc, msg, type }[]，不可直接 String()。
 */
export function formatUpstreamErrorDetail(json: unknown): string {
  if (json == null) return '';
  if (typeof json === 'string') return json.slice(0, 2000);
  if (typeof json !== 'object') return String(json).slice(0, 500);

  const obj = json as Record<string, unknown>;

  if (Array.isArray(obj.detail)) {
    const parts = obj.detail.map(formatValidationItem).filter(Boolean);
    if (parts.length) return parts.join('；');
  }

  if (typeof obj.detail === 'string') return obj.detail;
  if (typeof obj.message === 'string') return obj.message;
  if (typeof obj.error === 'string') return obj.error;

  try {
    return JSON.stringify(json).slice(0, 500);
  } catch {
    return String(json).slice(0, 500);
  }
}

function formatValidationItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const row = item as { loc?: unknown; msg?: string; message?: string };
  const text = row.msg ?? row.message;
  if (!text) {
    try {
      return JSON.stringify(item);
    } catch {
      return '';
    }
  }
  if (Array.isArray(row.loc) && row.loc.length) {
    return `${row.loc.join('.')}: ${text}`;
  }
  return text;
}
