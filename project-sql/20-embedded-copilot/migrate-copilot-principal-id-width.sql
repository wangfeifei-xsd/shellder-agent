-- 增量：Copilot JWT sub（copilot:appId:externalUserId）超过 CHAR(36)，放宽运行时主体 ID 列
-- 与 prisma/migrations/20260603120000_copilot_principal_id_width 对齐
-- 用法：mysql -h HOST -u USER -p agent_platform < migrate-copilot-principal-id-width.sql

USE `agent_platform`;

ALTER TABLE `session` MODIFY COLUMN `user_id` VARCHAR(256) NOT NULL
  COMMENT '主体 ID：管理端 user.id；Copilot 为 JWT sub';

ALTER TABLE `task` MODIFY COLUMN `user_id` VARCHAR(256) NULL
  COMMENT '发起人：管理端 user.id；Copilot 为 JWT sub';

ALTER TABLE `approval` MODIFY COLUMN `initiator_id` VARCHAR(256) NULL
  COMMENT '发起人：管理端 user.id；Copilot 为 JWT sub';

ALTER TABLE `tool_call_audit` MODIFY COLUMN `caller_user_id` VARCHAR(256) NULL
  COMMENT '调用人：管理端 user.id；Copilot 为 JWT sub';

ALTER TABLE `external_call_audit` MODIFY COLUMN `caller_user_id` VARCHAR(256) NULL
  COMMENT '触发调用方：管理端 user.id；Copilot 为 JWT sub';

ALTER TABLE `rule_hit` MODIFY COLUMN `caller_user_id` VARCHAR(256) NULL
  COMMENT '触发方：管理端 user.id；Copilot 为 JWT sub';

ALTER TABLE `skill_execution_log` MODIFY COLUMN `user_id` VARCHAR(256) NULL
  COMMENT '执行人：管理端 user.id；Copilot 为 JWT sub';
