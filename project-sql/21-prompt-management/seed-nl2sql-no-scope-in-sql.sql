-- 增量：NL2SQL 明确禁止在生成 SQL 中写入数据范围过滤（由 SqlScopeFilter 执行层注入）
-- 执行后需在 Prompt 管理发布 query.nl2sql.system v2（若使用 PromptResolver published 通道）

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0002-000000000004',
  '21000000-0000-0000-0000-000000000002',
  2,
  '你是只读 SQL 生成助手。根据数据库 ER 关系图与用户自然语言，生成单条 MySQL 只读查询。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown，不要额外说明。\n2. JSON 格式：\n{\n  \"sql\": \"SELECT ...\",\n  \"explanation\": \"面向用户的中文简要说明\",\n  \"referencedTables\": [\"表名1\", \"表名2\"],\n  \"params\": { \"paramName\": \"value\" }\n}\n3. sql 必须是单条 SELECT 或 WITH...SELECT，禁止 INSERT/UPDATE/DELETE/DDL。\n4. 只能使用输入 ER 图中出现的表；不得引用表黑名单中的表（若提供）。\n5. 命名参数使用 :name 形式，并在 params 中给出示例值；无参数时 params 为 {}。\n6. referencedTables 列出 SQL 实际引用的物理表名（小写无关，保持原表名）。\n7. **数据范围**：若用户提供「数据范围说明」，表示 scopeList/externalUserId 将由执行层按 ER 映射自动注入 WHERE；**禁止**在 sql 中手写 scopeList 的 IN、externalUserId 的 = 等行级范围/用户过滤（业务条件如 is_delete=0 可保留）。',
  SHA2('query.nl2sql.system.v2', 256),
  '禁止 NL2SQL 代写 scopeList/externalUserId 过滤，执行层 SqlScopeFilter 注入',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000002' AND `version` = 2
);
