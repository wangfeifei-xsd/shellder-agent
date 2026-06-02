/** NL2SQL user 模板变量（正文在 prompt_version，此处仅组装数据） */
export function buildNl2SqlUserVariables(payload: {
  erContext: string;
  tableBlacklist: string[];
  fieldBlacklist: string[];
  maxRows: number;
  userMessage: string;
  fewShot?: string;
}): Record<string, string | number> {
  const tableBlacklistLine = payload.tableBlacklist.length
    ? `- 表黑名单（禁止引用）：${payload.tableBlacklist.join(', ')}`
    : '- 表黑名单：未配置（仅须为 ER 内表且只读）';
  const fieldBlacklistLine = payload.fieldBlacklist.length
    ? `- 字段黑名单（禁止引用）：${payload.fieldBlacklist.join(', ')}`
    : '- 字段黑名单：未配置';
  const fewShotBlock = payload.fewShot
    ? `## 参考 SQL 模板（few-shot）\n${payload.fewShot}\n\n`
    : '';

  return {
    erContext: payload.erContext,
    tableBlacklistLine,
    fieldBlacklistLine,
    maxRows: payload.maxRows,
    userMessage: payload.userMessage,
    fewShotBlock,
  };
}
