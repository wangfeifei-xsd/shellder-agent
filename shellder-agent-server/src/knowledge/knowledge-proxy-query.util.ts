/** 仅当值为合法整数时才写入 wiki 查询参数（避免 NaN / UUID 等导致 422） */
export function coerceQueryInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return undefined;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function pickQueryInts(
  entries: Record<string, unknown>,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(entries)) {
    const n = coerceQueryInt(value);
    if (n !== undefined) out[key] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
