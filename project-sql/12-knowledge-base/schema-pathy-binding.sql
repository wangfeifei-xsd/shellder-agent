-- 目标库: agent_platform
USE `agent_platform`;

-- 增量：wiki 代理模式 — knowledge_base 增加 wiki 路径绑定
-- 依赖：project-sql/12-knowledge-base/schema.sql 已执行

ALTER TABLE `agent_platform`.`knowledge_base`
  ADD COLUMN `wiki_prefix` VARCHAR(256) NULL
    COMMENT 'wiki wiki 子路径前缀，如 tenants/{tenantId}/；空则运行时使用默认'
    AFTER `description`;