USE `agent_platform`;

INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '22000000-0000-0000-0000-000000000001',
  'action.http_query.catalog',
  'HTTP 查询工具目录',
  'action 能力 LLM 信号模式：注入可用 HTTP 查询工具列表',
  'action', 'system', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('toolCatalog')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '22000000-0000-0000-0001-000000000001',
  '22000000-0000-0000-0000-000000000001',
  1,
  '## HTTP 查询工具\n\n当用户问题需要调用外部业务查询接口时，从下列工具中选择，并严格按格式输出信号（不要暴露 URL）：\n\n{{toolCatalog}}\n\n信号格式：`[查询工具:tool_code {\"param\":\"value\"}]`\n\ntool_code 须与上表一致；params 为 JSON 对象，仅包含该工具声明的参数。',
  SHA2('action.http_query.catalog.v1', 256),
  'HTTP 业务查询工具 Prompt 目录（Phase 2）',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '22000000-0000-0000-0000-000000000001' AND `version` = 1
);
