-- 模块 03 — 用户与权限 种子数据
-- 提供内置「超级管理员」角色与默认管理员账号，并绑定 02 模块的默认租户。
-- 幂等：role 按 code、user 按 username upsert；关联表先删后插，固定 id 便于跨环境引用。
--
-- 默认账号：admin / admin123（password_hash 为 bcrypt，cost=10）。请首次登录后尽快修改密码。
-- 注：shellder-agent-server 启动时也会自动幂等创建该管理员（可用 AUTH_BOOTSTRAP=false 关闭）。

-- 1) 超级管理员角色（menus=["*"] 表示全部菜单；policy 含四类能力 + 高风险审批）
INSERT INTO `role`
    (`id`, `code`, `name`, `description`, `menus`, `modules`, `tool_scopes`, `policy`, `is_system`, `created_at`, `updated_at`)
VALUES (
    '00000000-0000-0000-0000-0000000000a1',
    'super-admin',
    '超级管理员',
    '系统内置角色，拥有全部菜单、模块与能力权限',
    JSON_ARRAY('*'),
    JSON_ARRAY(
        'tenant.manage', 'user.manage', 'role.manage', 'policy.manage', 'audit.view',
        'connector.manage', 'tool.manage', 'session.manage', 'task.manage',
        'approval.handle', 'settings.manage'
    ),
    JSON_ARRAY('*'),
    JSON_OBJECT(
        'capabilities', JSON_ARRAY('qa', 'query', 'action', 'workflow'),
        'canApproveHighRisk', true
    ),
    true,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `is_system` = true,
    `updated_at` = CURRENT_TIMESTAMP(3);

-- 2) 默认管理员账号（bcrypt('admin123')）
INSERT INTO `user`
    (`id`, `username`, `password_hash`, `display_name`, `email`, `status`, `is_system`, `remark`, `created_at`, `updated_at`)
VALUES (
    '00000000-0000-0000-0000-0000000000u1',
    'admin',
    '$2a$10$dubTdiqQmOpUp.gqBL1Tc.4YrBAjI8S2XL4/ccYGpP1exRmywL4he',
    '平台管理员',
    NULL,
    'enabled',
    true,
    '平台初始化默认管理员（请尽快修改密码）',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `display_name` = VALUES(`display_name`),
    `is_system` = true,
    `updated_at` = CURRENT_TIMESTAMP(3);

-- 3) 绑定管理员角色
INSERT INTO `user_role` (`user_id`, `role_id`)
SELECT u.`id`, r.`id`
FROM `user` u, `role` r
WHERE u.`username` = 'admin' AND r.`code` = 'super-admin'
ON DUPLICATE KEY UPDATE `user_id` = `user_role`.`user_id`;

-- 4) 绑定默认租户（来自 02-tenant-management/seed.sql，code='default'）
INSERT INTO `user_tenant` (`user_id`, `tenant_id`)
SELECT u.`id`, t.`id`
FROM `user` u, `tenant` t
WHERE u.`username` = 'admin' AND t.`code` = 'default'
ON DUPLICATE KEY UPDATE `user_id` = `user_tenant`.`user_id`;
