-- 增量：会话嵌入主体快照（externalUserId、scopeList）
-- 用法：mysql -h HOST -u USER -p agent_platform < migrate-session-principal-context.sql

USE `agent_platform`;

ALTER TABLE `session`
  ADD COLUMN `principal_context` JSON NULL
  COMMENT '嵌入主体：externalUserId、scopeList' AFTER `last_message_at`;
