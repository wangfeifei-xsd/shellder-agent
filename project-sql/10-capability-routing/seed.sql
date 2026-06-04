-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 10 — 能力路由 Seed Data
-- 初始化四类基础能力模板（仅供演示/测试；正式环境由租户自行配置）
-- 注意：此处不插入真实数据，因为能力按租户隔离，需要先有租户才能创建能力。
-- 如需测试，可在已有租户下手动执行以下示例 SQL。
-- ================================================================

-- 默认租户（02-seed id 固定）四类基础能力 — 与 CapabilityService.ensureDefaultCapabilities 一致
INSERT INTO `agent_platform`.`capability`
  (`id`, `tenant_id`, `type`, `name`, `description`, `applicable_system`, `dependent_tools`, `permission_requirements`, `priority`, `status`, `created_at`, `updated_at`)
VALUES
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'qa',       '通用问答', '基于知识库的问答能力',   '全平台',   '[]', '[]', 10, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('a1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'query',    '数据查询', 'SQL 只读查询能力',      '数据分析', '[]', '[]', 20, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('a1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000001', 'action',   '业务操作', 'HTTP API 写操作能力',   '业务系统', '[]', '[]', 30, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('a1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000001', 'workflow', '流程编排', '多步骤任务编排能力',     '运营系统', '[]', '[]', 40, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = CURRENT_TIMESTAMP(3);