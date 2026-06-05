-- Session 嵌入主体快照（问数数据范围）
ALTER TABLE `session` ADD COLUMN `principal_context` JSON NULL;
