-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 10 — 能力路由 Seed Data
-- 初始化四类基础能力模板（仅供演示/测试；正式环境由租户自行配置）
-- 注意：此处不插入真实数据，因为能力按租户隔离，需要先有租户才能创建能力。
-- 如需测试，可在已有租户下手动执行以下示例 SQL。
-- ================================================================

-- 示例：假设已有租户 ID 为 '<TENANT_ID>'
-- INSERT INTO `agent_platform`.`capability` (`id`, `tenant_id`, `type`, `name`, `description`, `applicable_system`, `dependent_tools`, `permission_requirements`, `priority`, `status`, `created_at`, `updated_at`)
-- VALUES
--   (UUID(), '<TENANT_ID>', 'qa',       '通用问答',     '基于知识库的问答能力',       '全平台', '[]', '[]', 10, 'enabled', NOW(3), NOW(3)),
--   (UUID(), '<TENANT_ID>', 'query',    '数据查询',     'SQL 只读查询能力',          '数据分析', '[]', '["data:read"]', 20, 'enabled', NOW(3), NOW(3)),
--   (UUID(), '<TENANT_ID>', 'action',   '业务操作',     'HTTP API 写操作能力',       '业务系统', '[]', '["order:write"]', 30, 'enabled', NOW(3), NOW(3)),
--   (UUID(), '<TENANT_ID>', 'workflow', '流程编排',     '多步骤任务编排能力',         '运营系统', '[]', '["workflow:execute"]', 40, 'enabled', NOW(3), NOW(3));

-- 无实际初始化数据