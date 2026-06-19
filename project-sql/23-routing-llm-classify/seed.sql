USE `agent_platform`;

INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '23000000-0000-0000-0000-000000000001',
  'routing.classify.system',
  '能力路由 LLM 分类 System',
  'Stage1 可选：将用户输入分类到 qa/query/action/workflow 四类能力',
  'routing', 'system', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessage', 'allowedCapabilities')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '23000000-0000-0000-0001-000000000001',
  '23000000-0000-0000-0000-000000000001',
  1,
  '你是 shellder-agent 能力路由分类器。根据用户输入，将其归类到以下能力类型之一：{{allowedCapabilities}}。\n\n类型含义：\n- qa：知识问答、解释说明\n- query：数据库智能问数（NL2SQL），如统计、报表、查表\n- action：业务操作或 HTTP 业务只读查询（含 http_query Tool）\n- workflow：流程、审批、批量编排\n\n仅输出 JSON，不要其他文字：\n{"capabilityType":"qa|query|action|workflow","confidence":0.0-1.0,"reason":"简短理由"}\n\n用户输入：{{userMessage}}',
  SHA2('routing.classify.system.v1', 256),
  '能力路由 Phase3 可选 LLM Stage1',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '23000000-0000-0000-0000-000000000001' AND `version` = 1
);
