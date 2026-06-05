USE `agent_platform`;

CREATE TABLE `agent_platform`.`tenant` (
    `id`                 CHAR(36)     NOT NULL COMMENT 'Agent 库主键；业务表 tenant_id 外键',
    `code`               VARCHAR(64)  NOT NULL COMMENT '租户编码，平台内唯一',
    `name`               VARCHAR(128) NOT NULL COMMENT '租户名称',
    `status`             ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/禁用',
    `external_tenant_id` VARCHAR(128) NULL COMMENT '可选；上层业务租户标识，手工维护，非同步字段',
    `config`             JSON         NULL COMMENT '开通能力 capabilities、默认限额 limits、隔离策略 isolation 等',
    `admin_user_id`      CHAR(36)     NULL COMMENT '可选；租户管理员（平台用户，用户模块未就绪前可空）',
    `remark`             VARCHAR(512) NULL COMMENT '备注',
    `created_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`         DATETIME(3)  NOT NULL COMMENT '更新时间',

    UNIQUE INDEX `tenant_code_key` (`code`),
    INDEX `tenant_status_idx` (`status`),
    INDEX `tenant_external_tenant_id_idx` (`external_tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='租户主数据';
