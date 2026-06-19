/** LLM 文本信号：[查询工具:tool_code {...}] */
export const HTTP_QUERY_SIGNAL_RE =
  /\[查询工具:\s*([a-z][a-z0-9_]*)\s*(\{[\s\S]*?\})?\s*\]/g;

export interface ParsedHttpQuerySignal {
  toolCode: string;
  params: Record<string, unknown>;
  raw: string;
}

/** 解析单条信号（取首个匹配） */
export function parseHttpQuerySignal(text: string): ParsedHttpQuerySignal | null {
  HTTP_QUERY_SIGNAL_RE.lastIndex = 0;
  const match = HTTP_QUERY_SIGNAL_RE.exec(text);
  if (!match) return null;

  const toolCode = match[1];
  let params: Record<string, unknown> = {};
  if (match[2]) {
    try {
      const parsed = JSON.parse(match[2]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        params = parsed as Record<string, unknown>;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  return { toolCode, params, raw: match[0] };
}

/** 文本中是否含 HTTP 查询工具信号 */
export function peekHttpQuerySignal(text: string): boolean {
  HTTP_QUERY_SIGNAL_RE.lastIndex = 0;
  return HTTP_QUERY_SIGNAL_RE.test(text);
}
