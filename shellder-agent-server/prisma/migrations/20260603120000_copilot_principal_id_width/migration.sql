-- Copilot JWT sub 形如 copilot:{appId}:{externalUserId}，长度可超过 36，需放宽主体 ID 列

ALTER TABLE `session` MODIFY COLUMN `user_id` VARCHAR(256) NOT NULL;

ALTER TABLE `task` MODIFY COLUMN `user_id` VARCHAR(256) NULL;

ALTER TABLE `approval` MODIFY COLUMN `initiator_id` VARCHAR(256) NULL;

ALTER TABLE `tool_call_audit` MODIFY COLUMN `caller_user_id` VARCHAR(256) NULL;

ALTER TABLE `external_call_audit` MODIFY COLUMN `caller_user_id` VARCHAR(256) NULL;

ALTER TABLE `rule_hit` MODIFY COLUMN `caller_user_id` VARCHAR(256) NULL;

ALTER TABLE `skill_execution_log` MODIFY COLUMN `user_id` VARCHAR(256) NULL;
