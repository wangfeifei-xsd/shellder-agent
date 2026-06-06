/** 从 URL 查询参数解析 wikiPrefixes（逗号分隔或 JSON 数组） */
export function parseWikiPrefixesFromQuery(raw: string | null): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((x) => typeof x === 'string')
      ) {
        const list = parsed
          .map((s) => s.trim().replace(/^\/+/, '').replace(/\/+$/, ''))
          .filter(Boolean);
        return list.length > 0 ? list : undefined;
      }
    } catch {
      /* fall through */
    }
  }
  const list = trimmed
    .split(',')
    .map((s) => s.trim().replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}
