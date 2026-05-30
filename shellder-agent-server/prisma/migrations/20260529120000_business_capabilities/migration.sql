-- 阶段 14 — 四类业务能力
-- 优化流程型任务按 capability_type + status 组合查询
CREATE INDEX `task_capability_type_status_created_at_idx` ON `task`(`capability_type`, `status`, `created_at` DESC);
