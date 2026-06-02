/** 查询结果解读 user 模板变量 */
export function buildQueryResultUserVariables(payload: {
  userMessage: string;
  rowCount: number;
  columns: string[];
  rowsJson: string;
  truncated: boolean;
  displayedRowCount: number;
}): Record<string, string | number> {
  const columnsLine = payload.columns.length
    ? payload.columns.join(', ')
    : '（无）';
  const truncatedLine = payload.truncated
    ? `- 截断：是（LLM 可见前 ${payload.displayedRowCount} 行，共 ${payload.rowCount} 行）\n`
    : '';

  return {
    userMessage: payload.userMessage,
    rowCount: payload.rowCount,
    columnsLine,
    truncatedLine,
    rowsJson: payload.rowsJson,
  };
}
