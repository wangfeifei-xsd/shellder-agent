/** NL2SQL user 模板变量（正文在 prompt_version，此处仅组装数据） */
export function buildNl2SqlUserVariables(payload: {
  erContext: string;
  tableBlacklist: string[];
  fieldBlacklist: string[];
  maxRows: number;
  userMessage: string;
  fewShot?: string;
  scopeContext?: string;
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
  const scopeContextBlock =
    payload.scopeContext?.trim() &&
    !payload.scopeContext.includes('未配置业务数据范围')
      ? `## 数据范围说明（NL2SQL 禁止代写过滤条件）\n` +
          `- scopeList / externalUserId 的行级过滤由 **SQL 执行层** 根据 ER 列映射自动注入，**禁止**在 sql 字段中编写 IN、= 等范围/用户条件。\n` +
          `- 若问题涉及下列受管控表，须正常 SELECT/JOIN 到这些表，但不要代替执行层添加范围条件。\n` +
          `${payload.scopeContext.trim()}\n\n`
      : '';

  return {
    erContext: payload.erContext,
    tableBlacklistLine,
    fieldBlacklistLine,
    maxRows: payload.maxRows,
    userMessage: payload.userMessage,
    fewShotBlock,
    scopeContextBlock,
  };
}
