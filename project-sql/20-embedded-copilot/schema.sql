USE `agent_platform`;

CREATE TABLE IF NOT EXISTS `agent_platform`.`copilot_config` (
  `id`                   CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`            CHAR(36)     NOT NULL COMMENT '所属租户 → tenant.id',
  `app_id`               CHAR(36)     NOT NULL COMMENT '关联 OpenAPI 应用 → openapi_app.id',
  `name`                 VARCHAR(128) NOT NULL COMMENT '配置名称（便于管理）',
  `status`               ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用状态',
  `domain_whitelist`     JSON         NULL     COMMENT '允许嵌入的域名列表（iframe 安全）',
  `theme`                JSON         NULL     COMMENT '主题配置（primaryColor, logo, title 等）',
  `features`             JSON         NULL     COMMENT '功能开关（enableHistory, enableTask, enableConfirmation 等）',
  `welcome_message`      TEXT         NULL     COMMENT '欢迎语',
  `placeholder`          VARCHAR(256) NULL     COMMENT '输入框占位文字',
  `max_history_messages` INT          NOT NULL DEFAULT 50 COMMENT '历史消息最大加载条数',
  `token_ttl_seconds`    INT          NOT NULL DEFAULT 3600 COMMENT '换票 Token 有效期（秒）',
  `created_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',

  PRIMARY KEY (`id`),
  UNIQUE KEY `copilot_config_app_id_key` (`app_id`),
  INDEX `copilot_config_tenant_id_idx` (`tenant_id`),
  INDEX `copilot_config_status_idx` (`status`),

  CONSTRAINT `copilot_config_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `copilot_config_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `agent_platform`.`openapi_app`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='嵌入式 Copilot 配置';
