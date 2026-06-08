-- ER 限制字段 Prompt + NL2SQL scopeContext v2（ID 009/010，避免与 er_diagram 007/008 冲突）

INSERT INTO `prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000009',
  'connector.er_data_scope.system',
  'ER 限制字段 System',
  '分析各表 scopeColumn / userColumn',
  'sql_conversion', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000009',
  '21000000-0000-0000-0000-000000000009',
  1,
  '你是数据库治理助手。根据表名、列名、注释推断每张表用于行级数据范围的物理列：\n- scopeColumn：部门/组织/租户范围，对应业务 scopeList（如 dept_id、org_id）\n- userColumn：个人归属，对应 externalUserId（如 owner_id、created_by）\n无合适列可省略该字段。只输出 JSON，不要 markdown 包裹。',
  SHA2('connector.er_data_scope.system.v1', 256),
  '问数数据范围配置期 LLM',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000009' AND `version` = 1
);

INSERT INTO `prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000010',
  'connector.er_data_scope.user',
  'ER 限制字段 User',
  'schema + 表列表骨架',
  'sql_conversion', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessageBody')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000010',
  '21000000-0000-0000-0000-000000000010',
  1,
  '{{userMessageBody}}',
  SHA2('connector.er_data_scope.user.v1', 256),
  '正文由 er-data-scope.variables 组装',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000010' AND `version` = 1
);

-- 纯 Docker / prisma migrate deploy 未执行 project-sql seed 时，须先 bootstrap query.nl2sql.user
INSERT INTO `prompt_template`
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

INSERT INTO `prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000003',
  '21000000-0000-0000-0000-000000000003',
  1,
  '## ER 关系图（已裁剪）\n{{erContext}}\n\n## Tool 约束\n{{tableBlacklistLine}}\n{{fieldBlacklistLine}}\n- 建议最大返回行数：{{maxRows}}\n## 用户问题\n{{userMessage}}\n\n{{fewShotBlock}}请生成 JSON。',
  SHA2('query.nl2sql.user.v1', 256),
  'NL2SQL user prompt',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000003' AND `version` = 1
);

INSERT INTO `prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0002-000000000003',
  '21000000-0000-0000-0000-000000000003',
  2,
  '## ER 关系图（已裁剪）\n{{erContext}}\n\n{{scopeContextBlock}}## Tool 约束\n{{tableBlacklistLine}}\n{{fieldBlacklistLine}}\n- 建议最大返回行数：{{maxRows}}\n## 用户问题\n{{userMessage}}\n\n{{fewShotBlock}}请生成 JSON。',
  SHA2('query.nl2sql.user.v2', 256),
  '增加 scopeContextBlock（问数数据范围）',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000003' AND `version` = 2
);

UPDATE `prompt_template`
SET `variable_schema` = JSON_OBJECT(
  'required',
  JSON_ARRAY('erContext', 'tableBlacklistLine', 'fieldBlacklistLine', 'maxRows', 'userMessage', 'fewShotBlock', 'scopeContextBlock')
),
`updated_at` = CURRENT_TIMESTAMP(3)
WHERE `prompt_key` = 'query.nl2sql.user';
