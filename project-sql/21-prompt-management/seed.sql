-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 21 — Prompt 管理种子数据
-- 八个 V1 prompt_key，各含 published version=1（正文自现有代码迁移）
-- 幂等：按 prompt_key + scope 定位 template；version 1 published 仅首次插入

-- ── qa.dialogue.system ────────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000001',
  'qa.dialogue.system',
  '问答生成 System',
  '问答型 recall 后生成阶段 system 模板',
  'qa', 'system', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('citationLines', 'contextBlock')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000001',
  '21000000-0000-0000-0000-000000000001',
  1,
  '你是 shellder-agent 平台的问答助手。请基于下方「知识库召回结果」回答用户问题。\n- 优先使用注入上下文与引用片段中的事实；不要编造未出现的信息。\n- 若知识库无相关内容，礼貌说明未找到相关信息，并建议用户换种问法或联系管理员。\n- 回答末尾可简要列出引用来源编号。\n\n## 召回引用\n{{citationLines}}{{contextBlock}}',
  SHA2('qa.dialogue.system.v1', 256),
  '从 QaPipelineService.composeSystemPrompt 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000001' AND `version` = 1
);

-- ── query.nl2sql.system ───────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000002',
  'query.nl2sql.system',
  'NL2SQL System',
  'NL2SQL 约束与 JSON 输出格式',
  'query', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000002',
  '21000000-0000-0000-0000-000000000002',
  1,
  '你是只读 SQL 生成助手。根据数据库 ER 关系图与用户自然语言，生成单条 MySQL 只读查询。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown，不要额外说明。\n2. JSON 格式：\n{\n  \"sql\": \"SELECT ...\",\n  \"explanation\": \"面向用户的中文简要说明\",\n  \"referencedTables\": [\"表名1\", \"表名2\"],\n  \"params\": { \"paramName\": \"value\" }\n}\n3. sql 必须是单条 SELECT 或 WITH...SELECT，禁止 INSERT/UPDATE/DELETE/DDL。\n4. 只能使用输入 ER 图中出现的表；不得引用表黑名单中的表（若提供）。\n5. 命名参数使用 :name 形式，并在 params 中给出示例值；无参数时 params 为 {}。\n6. referencedTables 列出 SQL 实际引用的物理表名（小写无关，保持原表名）。',
  SHA2('query.nl2sql.system.v1', 256),
  '从 nl2sql.prompt.ts NL2SQL_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000002' AND `version` = 1
);

-- ── query.nl2sql.user ─────────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000003',
  'query.nl2sql.user',
  'NL2SQL User',
  'ER + 黑名单 + 用户问题骨架',
  'query', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('erContext', 'tableBlacklistLine', 'fieldBlacklistLine', 'maxRows', 'userMessage', 'fewShotBlock')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000003',
  '21000000-0000-0000-0000-000000000003',
  1,
  '## ER 关系图（已裁剪）\n{{erContext}}\n\n## Tool 约束\n{{tableBlacklistLine}}\n{{fieldBlacklistLine}}\n- 建议最大返回行数：{{maxRows}}\n## 用户问题\n{{userMessage}}\n\n{{fewShotBlock}}请生成 JSON。',
  SHA2('query.nl2sql.user.v1', 256),
  '从 buildNl2SqlUserPrompt 骨架迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000003' AND `version` = 1
);

-- ── query.result.system ───────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000004',
  'query.result.system',
  '查询结果解读 System',
  '查询结果自然语言解读',
  'query', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000004',
  '21000000-0000-0000-0000-000000000004',
  1,
  '你是业务数据查询助手。根据用户的提问与数据库查询结果，用简洁、准确的中文给出回答。\n\n要求：\n1. 仅依据查询结果中的数据作答，不得编造结果中不存在的字段或数值。\n2. 若结果为空（rowCount=0），说明未查到符合条件的数据，可简要提示可能原因。\n3. 若结果被截断（truncated=true），明确告知「共 N 条，以下基于前 M 条作答」。\n4. 聚合或单值结果用自然语言表述；明细较多时可概括要点，必要时用简短列表。\n5. 直接回答用户问题，不要复述 SQL，不要输出 JSON。\n6. 语气专业、友好，面向业务用户而非技术人员。',
  SHA2('query.result.system.v1', 256),
  '从 query-result.prompt.ts QUERY_RESULT_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000004' AND `version` = 1
);

-- ── query.result.user ─────────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000005',
  'query.result.user',
  '查询结果解读 User',
  '问题 + 结果 JSON 骨架',
  'query', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessage', 'rowCount', 'columnsLine', 'truncatedLine', 'rowsJson')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000005',
  '21000000-0000-0000-0000-000000000005',
  1,
  '## 用户问题\n{{userMessage}}\n\n## 查询结果元信息\n- 总行数：{{rowCount}}\n- 列：{{columnsLine}}\n{{truncatedLine}}## 查询结果数据（JSON）\n{{rowsJson}}\n\n请根据以上数据回答用户问题。',
  SHA2('query.result.user.v1', 256),
  '从 buildQueryResultUserPrompt 骨架迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000005' AND `version` = 1
);

-- ── connector.er_diagram.system ───────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000006',
  'connector.er_diagram.system',
  'ER 构图 System',
  '初版 ER 关系图生成',
  'sql_conversion', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000006',
  '21000000-0000-0000-0000-000000000006',
  1,
  '你是资深 DBA 助手。根据给定的数据库表结构摘要 JSON，推断表间关系并输出 ER 关系图。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown 代码块，不要额外说明。\n2. JSON 结构必须为（不要输出 columns，列信息由系统从抽取结果补全）：\n{\n  \"tables\": [\n    { \"name\": \"物理表名\", \"displayName\": \"中文或业务显示名（可用表注释）\" }\n  ],\n  \"relationships\": [\n    {\n      \"id\": \"rel_唯一id\",\n      \"from\": \"源表名\",\n      \"to\": \"目标表名\",\n      \"fromColumns\": [\"源列\"],\n      \"toColumns\": [\"目标列\"],\n      \"cardinality\": \"1:1|1:N|N:1|N:M\",\n      \"inferred\": true/false\n    }\n  ]\n}\n3. tables 必须覆盖输入中的每一张物理表（仅 name + displayName），禁止臆造表名。\n4. 有外键时 inferred 为 false；仅凭列名模式推断时 inferred 为 true。\n5. cardinality 使用 N:1 表示多对一（from 多 to 一）。',
  SHA2('connector.er_diagram.system.v1', 256),
  '从 er-diagram.prompt.ts ER_DIAGRAM_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000006' AND `version` = 1
);

-- ── connector.er_diagram.refine.system ────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000007',
  'connector.er_diagram.refine.system',
  'ER 构图优化 System',
  '基于 draft 辅助优化 ER',
  'sql_conversion', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000007',
  '21000000-0000-0000-0000-000000000007',
  1,
  CONCAT(
    '你是资深 DBA 助手。根据给定的数据库表结构摘要 JSON，推断表间关系并输出 ER 关系图。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown 代码块，不要额外说明。\n2. JSON 结构必须为（不要输出 columns，列信息由系统从抽取结果补全）：\n{\n  \"tables\": [\n    { \"name\": \"物理表名\", \"displayName\": \"中文或业务显示名（可用表注释）\" }\n  ],\n  \"relationships\": [\n    {\n      \"id\": \"rel_唯一id\",\n      \"from\": \"源表名\",\n      \"to\": \"目标表名\",\n      \"fromColumns\": [\"源列\"],\n      \"toColumns\": [\"目标列\"],\n      \"cardinality\": \"1:1|1:N|N:1|N:M\",\n      \"inferred\": true/false\n    }\n  ]\n}\n3. tables 必须覆盖输入中的每一张物理表（仅 name + displayName），禁止臆造表名。\n4. 有外键时 inferred 为 false；仅凭列名模式推断时 inferred 为 true。\n5. cardinality 使用 N:1 表示多对一（from 多 to 一）。\n\n补充（在已有 er_draft 基础上辅助优化时）：\n6. 输入含 current_er_draft 时，在其基础上查漏补缺、修正 displayName 与 relationships，不要推倒重来。\n7. 用户已确认的关系（inferred=false）若结构未变，必须保持 inferred=false。\n8. 可新增缺失关系、修正错误基数或列映射；不要删除 current_er_draft 中合理且与 schema 一致的关系，除非与 schema 外键明显矛盾。'
  ),
  SHA2('connector.er_diagram.refine.system.v1', 256),
  '从 ER_DIAGRAM_REFINE_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000007' AND `version` = 1
);

-- ── connector.er_diagram.user ─────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000008',
  'connector.er_diagram.user',
  'ER 构图 User',
  'schema + 可选 current_er_draft 骨架',
  'sql_conversion', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessageBody')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000008',
  '21000000-0000-0000-0000-000000000008',
  1,
  '{{userMessageBody}}',
  SHA2('connector.er_diagram.user.v1', 256),
  'user 正文由代码组装 userMessageBody（初版/优化）后注入',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000008' AND `version` = 1
);

-- RBAC：为超级管理员追加 prompt 模块权限（菜单 * 已含 prompt）
UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:read'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:read"');

UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:write'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:write"');

UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:publish'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:publish"');

UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:debug'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:debug"');
