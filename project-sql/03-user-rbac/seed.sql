USE `agent_platform`;

INSERT INTO `agent_platform`.`role`
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
        'approval.handle', 'settings.manage',
        'prompt:read', 'prompt:write', 'prompt:publish', 'prompt:debug'
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

INSERT INTO `agent_platform`.`user`
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

INSERT INTO `agent_platform`.`user_role` (`user_id`, `role_id`)
SELECT u.`id`, r.`id`
FROM `user` u, `role` r
WHERE u.`username` = 'admin' AND r.`code` = 'super-admin'
ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`);

INSERT INTO `agent_platform`.`user_tenant` (`user_id`, `tenant_id`)
SELECT u.`id`, t.`id`
FROM `user` u, `tenant` t
WHERE u.`username` = 'admin' AND t.`code` = 'default'
ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`);
