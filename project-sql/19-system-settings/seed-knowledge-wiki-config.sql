-- 目标库: agent_platform
USE `agent_platform`;

-- ============================================================
-- 增量：wiki 连接配置写入 system_config
-- 适用：已执行过旧版 seed、未包含 knowledge.wiki* 的库
-- ============================================================

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'knowledge', 'knowledge.wikiBaseUrl',   '',      'wiki 知识库服务根 URL（知识库管理页配置，无尾斜杠）'),
  (UUID(), 'knowledge', 'knowledge.wikiTimeoutMs', '30000', 'wiki 代理 HTTP 超时（毫秒）')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `updated_at` = CURRENT_TIMESTAMP(3);
