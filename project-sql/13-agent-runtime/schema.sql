-- ================================================================
-- 阶段 12 — Agent 运行时与流式响应（Phase 12）
-- 功能清单 §4.5 Agent Runtime / 架构 §4.2 / 执行计划 §4
-- 依赖：08-session-message（session 表 status 枚举）
--       09-task-worker（task 表 status 枚举）
-- ================================================================
--
-- 本阶段无新增表。
-- 增量变更：为 session 和 task 表的状态枚举新增 'pending_confirm' 值，
-- 支持确认中断场景（架构 §4.5 / 执行计划 §4.3）。
-- Agent Runtime 运行时数据流经已有的 session、message、task 表。

-- 为 session.status 枚举新增 pending_confirm
ALTER TABLE `session`
  MODIFY COLUMN `status` ENUM(
    'active',
    'completed',
    'failed',
    'cancelled',
    'pending_confirm'
  ) NOT NULL DEFAULT 'active';

-- 为 task.status 枚举新增 pending_confirm
ALTER TABLE `task`
  MODIFY COLUMN `status` ENUM(
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'timeout',
    'pending_confirm'
  ) NOT NULL DEFAULT 'pending';
