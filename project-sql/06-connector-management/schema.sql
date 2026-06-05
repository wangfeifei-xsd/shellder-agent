USE `agent_platform`;

CREATE TABLE `agent_platform`.`connector` (
    `id`                   CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`            CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `name`                 VARCHAR(128) NOT NULL COMMENT '连接器名称',
    `type`                 ENUM('db_readonly', 'http', 'notification') NOT NULL
                           COMMENT '类型：只读数据库 / HTTP API / 消息通知接口',
    `target`               VARCHAR(512) NOT NULL COMMENT '目标系统地址（http/notification 为 URL；db_readonly 为 host:port）',
    `auth_type`            VARCHAR(32)  NOT NULL DEFAULT 'none' COMMENT '认证方式：none/basic/bearer/api_key/custom',
    `timeout_ms`           INTEGER      NOT NULL DEFAULT 5000 COMMENT '调用 / 测试超时（毫秒）',
    `status`               ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用 / 停用',
    `config`               JSON         NOT NULL COMMENT '非敏感配置(properties)+可引用Tool范围(allowedToolScopes)+加密凭证(secretCipher)',
    `description`          VARCHAR(512) NULL COMMENT '连接器说明',
    `last_test_status`     ENUM('success', 'failed') NULL COMMENT '最近一次连通性测试结果',
    `last_test_latency_ms` INTEGER      NULL COMMENT '最近一次测试响应耗时（毫秒）',
    `last_test_message`    VARCHAR(512) NULL COMMENT '最近一次测试结果说明',
    `last_tested_at`       DATETIME(3)  NULL COMMENT '最近一次测试时间',
    `created_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`           DATETIME(3)  NOT NULL COMMENT '更新时间',

    INDEX `connector_tenant_id_idx` (`tenant_id`),
    INDEX `connector_type_idx` (`type`),
    INDEX `connector_status_idx` (`status`),
    INDEX `connector_tenant_id_type_status_idx` (`tenant_id`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='外部连接器配置';

ALTER TABLE `agent_platform`.`connector` ADD CONSTRAINT `connector_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
