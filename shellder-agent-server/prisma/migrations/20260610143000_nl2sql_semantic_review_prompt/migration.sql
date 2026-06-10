-- NL2SQL 语义审核 Prompt（轻量 LLM 校验：SQL 是否正确回答用户问题）

INSERT INTO `prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000011',
  'query.nl2sql.review.system',
  'NL2SQL 语义审核 System',
  '审核生成的 SQL 是否正确回答了用户问题',
  'query', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000011',
  '21000000-0000-0000-0000-000000000011',
  1,
  '你是 SQL 语义审核助手。你的任务是判断一条已生成的 SQL 是否正确回答了用户的自然语言问题。\n\n审核要点：\n1. SQL 的查询目标是否与用户问题的意图一致（如用户问数量，SQL 是否用了 COUNT）。\n2. 用户提到的筛选条件（人名、部门名、时间等）是否在 SQL 的 WHERE 中体现为对应的参数绑定。\n3. extractedLiterals 中的每个实体是否都在 params 中有对应的值，且绑定到了合理的列。\n4. 若用户未提及具体筛选条件（如「一共有多少员工」），SQL 不应有多余的 WHERE 条件。\n\n仅输出一个 JSON 对象，不要 markdown，不要额外说明：\n- 通过：{\"pass\": true, \"reason\": \"\"}\n- 不通过：{\"pass\": false, \"reason\": \"具体问题描述，说明哪里不一致\"}',
  SHA2('query.nl2sql.review.system.v1', 256),
  'NL2SQL 轻量语义审核',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000011' AND `version` = 1
);

INSERT INTO `prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000012',
  'query.nl2sql.review.user',
  'NL2SQL 语义审核 User',
  '用户问题 + SQL + params 骨架',
  'query', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessage', 'sql', 'params', 'extractedLiterals')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000012',
  '21000000-0000-0000-0000-000000000012',
  1,
  '## 用户问题\n{{userMessage}}\n\n## 生成的 SQL\n{{sql}}\n\n## 参数（params）\n{{params}}\n\n## 提取的实体名（extractedLiterals）\n{{extractedLiterals}}\n\n请判断该 SQL 是否正确回答了用户问题，输出 JSON。',
  SHA2('query.nl2sql.review.user.v1', 256),
  'NL2SQL 语义审核 user 骨架',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000012' AND `version` = 1
);
