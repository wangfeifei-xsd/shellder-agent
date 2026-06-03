-- 命名统一：pathy → wiki（配置键与租户 wiki 前缀列）

UPDATE `system_config` SET `config_key` = 'knowledge.wikiBaseUrl'
WHERE `config_key` = 'knowledge.pathyBaseUrl';

UPDATE `system_config` SET `config_key` = 'knowledge.wikiTimeoutMs'
WHERE `config_key` = 'knowledge.pathyTimeoutMs';

ALTER TABLE `knowledge_base`
  CHANGE COLUMN `pathy_wiki_prefix` `wiki_prefix` VARCHAR(256) NULL
  COMMENT 'wiki 子路径前缀，如 tenants/{tenantId}/；空则运行时使用默认';
