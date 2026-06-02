/** ER user 模板 {{userMessageBody}}：初版 / refine 正文由代码组装后注入 */
export function buildErInitialUserMessageBody(schemaJson: string): string {
  return `请根据以下 schema_summary 生成 ER 关系图 JSON：\n${schemaJson}`;
}

export function buildErRefineUserMessageBody(
  schemaJson: string,
  draftJson: string,
): string {
  return `请在 current_er_draft 基础上结合 schema_summary 辅助优化 ER 关系图 JSON（查漏补缺，保留已确认关系）：

schema_summary:
${schemaJson}

current_er_draft:
${draftJson}`;
}
