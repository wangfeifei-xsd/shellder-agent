USE `agent_platform`;

CREATE TABLE `agent_platform`.`tool` (
    `id`               CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`        CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `name`             VARCHAR(128) NOT NULL COMMENT 'Tool 名称（租户内唯一）',
    `description`      VARCHAR(512) NULL COMMENT 'Tool 描述',
    `type`             ENUM('query', 'action', 'workflow', 'notification') NOT NULL
                       COMMENT '类型：查询型 / 操作型 / 流程型 / 通知型',
    `status`           ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用 / 停用',
    `input_schema`     JSON         NOT NULL COMMENT '入参 JSON Schema（保存前校验合法性）',
    `output_schema`    JSON         NULL COMMENT '出参 JSON Schema（可选）',
    `permission_scope` VARCHAR(128) NULL COMMENT '权限范围 key（如 order:read），配合 role.tool_scopes / 连接器 allowedToolScopes',
    `risk_level`       ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'low' COMMENT '风险等级（Policy 评估输入）',
    `need_confirmation` BOOLEAN     NOT NULL DEFAULT false COMMENT '是否需人工确认（高风险 / 显式确认）',
    `timeout_ms`       INTEGER      NOT NULL DEFAULT 10000 COMMENT '执行超时（毫秒）',
    `idempotency_key`  VARCHAR(128) NULL COMMENT '幂等键模板（操作型重试去重），可空',
    `audit_event_type` VARCHAR(128) NULL COMMENT '工具调用审计事件类型标识',
    `connector_id`     CHAR(36)     NULL COMMENT '关联连接器，→ connector.id；连接器删除后置空',
    `config`           JSON         NOT NULL COMMENT '类型相关配置：query→sql / action,notification→http / workflow→workflow',
    `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`       DATETIME(3)  NOT NULL COMMENT '更新时间',

    INDEX `tool_tenant_id_idx` (`tenant_id`),
    INDEX `tool_type_idx` (`type`),
    INDEX `tool_status_idx` (`status`),
    INDEX `tool_risk_level_idx` (`risk_level`),
    INDEX `tool_connector_id_idx` (`connector_id`),
    INDEX `tool_tenant_id_type_status_idx` (`tenant_id`, `type`, `status`),
    UNIQUE INDEX `tool_tenant_id_name_key` (`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='工具注册元数据';

ALTER TABLE `agent_platform`.`tool` ADD CONSTRAINT `tool_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`tool` ADD CONSTRAINT `tool_connector_id_fkey`
    FOREIGN KEY (`connector_id`) REFERENCES `agent_platform`.`connector`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
