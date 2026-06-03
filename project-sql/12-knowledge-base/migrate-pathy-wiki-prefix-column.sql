-- 目标库: agent_platform
USE `agent_platform`;

-- 增量：pathy_wiki_prefix → wiki_prefix
ALTER TABLE `agent_platform`.`knowledge_base`
  CHANGE COLUMN `pathy_wiki_prefix` `wiki_prefix` VARCHAR(256) NULL
  COMMENT 'wiki 子路径前缀，如 tenants/{tenantId}/；空则运行时使用默认';
