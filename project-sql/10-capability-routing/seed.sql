USE `agent_platform`;

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
