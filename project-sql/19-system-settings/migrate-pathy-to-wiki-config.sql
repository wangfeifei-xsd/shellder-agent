-- 目标库: agent_platform
USE `agent_platform`;

-- 增量：pathy 配置键 → wiki（无需 DDL）
UPDATE `agent_platform`.`system_config` SET `config_key` = 'knowledge.wikiBaseUrl'
WHERE `config_key` = 'knowledge.pathyBaseUrl';

UPDATE `agent_platform`.`system_config` SET `config_key` = 'knowledge.wikiTimeoutMs'
WHERE `config_key` = 'knowledge.pathyTimeoutMs';
