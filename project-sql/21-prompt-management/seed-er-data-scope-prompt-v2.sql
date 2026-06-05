-- 增量：强化 ER 限制字段 LLM — 物理列映射，禁止填嵌入参数名
USE `agent_platform`;

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0002-000000000009',
  '21000000-0000-0000-0000-000000000009',
  2,
  '你是数据库治理助手。为每张物理表配置「嵌入入参 → 表内物理列」映射：\n- scopeColumn：本表真实列名，运行期 scopeList 对此列 IN（如 cust_id、dept_id）\n- userColumn：本表真实列名，运行期 externalUserId 对此列 =（如 creator_id、owner_user_id）\n禁止把 scopeList、externalUserId 等参数名写入列字段；必须来自该表 columns。无合适列可省略。只输出 JSON。',
  SHA2('connector.er_data_scope.system.v2', 256),
  '明确物理列映射，禁止嵌入参数名当列名',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000009' AND `version` = 2
);
