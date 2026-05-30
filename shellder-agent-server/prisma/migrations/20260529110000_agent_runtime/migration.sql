-- 阶段 13 — Agent 运行时与流式响应
-- 为 session / task 状态枚举新增 pending_confirm（人工确认中断）
ALTER TABLE `session` MODIFY `status` ENUM('active', 'completed', 'failed', 'cancelled', 'pending_confirm') NOT NULL DEFAULT 'active';

ALTER TABLE `task` MODIFY `status` ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'pending_confirm') NOT NULL DEFAULT 'pending';
