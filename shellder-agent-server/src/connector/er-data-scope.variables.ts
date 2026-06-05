/** ER 限制字段 LLM user 正文（schema + 表列表） */
export function buildErDataScopeUserMessageBody(
  schemaJson: string,
  tableNamesJson: string,
): string {
  return `请为下列物理表配置「嵌入入参 → 表内物理列」映射：
- scopeColumn：本表物理列名，运行期用嵌入 scopeList 对此列做 IN（如 cust_id、dept_id、org_id）
- userColumn：本表物理列名，运行期用嵌入 externalUserId 对此列做 =（如 creator_id、owner_user_id）

禁止把 scopeList、externalUserId、scope_list 等嵌入参数名写入 scopeColumn/userColumn；必须填写 columns 里真实存在的列名。
禁止引用其他表的列，禁止臆造列名。无合适列可省略该字段。
关联/明细表若无租户列，通常仅配置 userColumn。

仅输出 JSON，不要 markdown 代码块，不要额外说明文字。reason 可选，须为简短中文（不超过 30 字），勿含英文双引号或未转义换行。
形如：
{"tables":[{"name":"表名","dataScope":{"scopeColumn":"列名或省略","userColumn":"列名或省略","reason":"简短理由"}}]}

schema_summary:
${schemaJson}

tables:
${tableNamesJson}`;
}
