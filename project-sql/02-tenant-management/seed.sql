USE `agent_platform`;

INSERT INTO `agent_platform`.`tenant`
    (`id`, `code`, `name`, `status`, `external_tenant_id`, `config`, `admin_user_id`, `remark`, `created_at`, `updated_at`)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    '默认租户',
    'enabled',
    NULL,
    JSON_OBJECT(
        'capabilities', JSON_ARRAY('qa', 'query', 'action', 'workflow'),
        'limits', JSON_OBJECT('maxSessions', 0, 'maxTasks', 0),
        'isolation', JSON_OBJECT(
            'dataIsolationStrategy', 'strict',
            'restrictCrossTenant', true,
            'connectorVisibleWithinTenant', true,
            'toolVisibleWithinTenant', true,
            'auditVisibleWithinTenant', true
        )
    ),
    NULL,
    '平台初始化默认租户（可禁用，勿删除引用中的 id）',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `updated_at` = CURRENT_TIMESTAMP(3);
