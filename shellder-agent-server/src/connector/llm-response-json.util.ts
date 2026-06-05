export const LLM_RESPONSE_LOG_MAX = 4000;

export function excerptLlmText(text: string, max = LLM_RESPONSE_LOG_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…（共 ${t.length} 字符，已截断）`;
}

/** 从 LLM 原文提取 JSON 字符串（去 markdown 代码块包裹） */
export function extractLlmJsonText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }
  return trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? trimmed;
}

/** 修复 LLM 常见 JSON 瑕疵：尾逗号、截断闭合 */
export function repairLlmJsonText(jsonStr: string): string {
  let s = jsonStr.trim();
  s = s.replace(/,\s*([}\]])/g, '$1');
  if (!s.endsWith('}') && !s.endsWith(']')) {
    const openBraces = (s.match(/\{/g) ?? []).length;
    const closeBraces = (s.match(/\}/g) ?? []).length;
    const openBrackets = (s.match(/\[/g) ?? []).length;
    const closeBrackets = (s.match(/\]/g) ?? []).length;
    s += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    s += '}'.repeat(Math.max(0, openBraces - closeBraces));
  }
  return s;
}

export function isLikelyTruncatedLlmJson(
  parseError: string,
  jsonStr: string,
): boolean {
  return (
    /unterminated string|unexpected end of json/i.test(parseError) ||
    (!jsonStr.trimEnd().endsWith('}') && jsonStr.includes('"tables"'))
  );
}

export function parseLlmJsonText(text: string): {
  ok: true;
  value: unknown;
  jsonStr: string;
} | {
  ok: false;
  parseError: string;
  jsonStr: string;
  likelyTruncated: boolean;
} {
  const jsonStr = extractLlmJsonText(text);
  const attempts = [jsonStr, repairLlmJsonText(jsonStr)];
  let lastError = 'unknown';
  for (const candidate of attempts) {
    try {
      return { ok: true, value: JSON.parse(candidate), jsonStr: candidate };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    ok: false,
    parseError: lastError,
    jsonStr,
    likelyTruncated: isLikelyTruncatedLlmJson(lastError, jsonStr),
  };
}

export interface SalvagedDataScopeTable {
  name: string;
  dataScope?: {
    scopeColumn?: string;
    userColumn?: string;
    reason?: string;
  };
}

function readJsonStringField(block: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const m = block.match(re);
  if (!m) return undefined;
  return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim() || undefined;
}

/** 全量 JSON 解析失败时，按已知表名逐段提取 scopeColumn / userColumn */
export function salvageDataScopeTables(
  text: string,
  knownTableNames: string[],
): SalvagedDataScopeTable[] {
  const tables: SalvagedDataScopeTable[] = [];
  const seen = new Set<string>();

  for (const tableName of knownTableNames) {
    const key = tableName.toLowerCase();
    if (seen.has(key)) continue;

    const patterns = [
      `"name"\\s*:\\s*"${escapeRegExp(tableName)}"`,
      `"name"\\s*:\\s*'${escapeRegExp(tableName)}'`,
    ];
    let start = -1;
    for (const pat of patterns) {
      const m = text.match(new RegExp(pat, 'i'));
      if (m?.index !== undefined) {
        start = m.index;
        break;
      }
    }
    if (start < 0) continue;

    const block = text.slice(start, start + 800);
    const scopeColumn = readJsonStringField(block, 'scopeColumn');
    const userColumn = readJsonStringField(block, 'userColumn');
    const reason = readJsonStringField(block, 'reason');
    if (!scopeColumn && !userColumn) continue;

    tables.push({
      name: tableName,
      dataScope: {
        ...(scopeColumn ? { scopeColumn } : {}),
        ...(userColumn ? { userColumn } : {}),
        ...(reason ? { reason } : {}),
      },
    });
    seen.add(key);
  }

  return tables;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
