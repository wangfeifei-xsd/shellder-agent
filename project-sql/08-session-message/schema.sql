USE `agent_platform`;

CREATE TABLE IF NOT EXISTS `agent_platform`.`session` (
  `id`               CHAR(36)     NOT NULL,
  `tenant_id`        CHAR(36)     NOT NULL,
  `user_id`          VARCHAR(256) NOT NULL COMMENT '主体 ID：管理端 user.id；Copilot 为 JWT sub',
  `title`            VARCHAR(256) DEFAULT NULL,
  `status`           ENUM('active','completed','failed','cancelled','pending_confirm') NOT NULL DEFAULT 'active',
  `capability_type`  ENUM('qa','query','action','workflow') DEFAULT NULL,
  `summary`          TEXT         DEFAULT NULL,
  `has_task`         TINYINT(1)   NOT NULL DEFAULT 0,
  `has_confirmation` TINYINT(1)   NOT NULL DEFAULT 0,
  `last_message_at`  DATETIME(3)  DEFAULT NULL,
  `principal_context` JSON         DEFAULT NULL COMMENT '嵌入主体：externalUserId、scopeList',
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  CONSTRAINT `fk_session_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

  INDEX `idx_session_tenant_id`          (`tenant_id`),
  INDEX `idx_session_user_id`            (`user_id`),
  INDEX `idx_session_status`             (`status`),
  INDEX `idx_session_capability_type`    (`capability_type`),
  INDEX `idx_session_tenant_status`      (`tenant_id`, `status`),
  INDEX `idx_session_tenant_user`        (`tenant_id`, `user_id`),
  INDEX `idx_session_last_message_at`    (`last_message_at`),
  INDEX `idx_session_created_at`         (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话';

CREATE TABLE IF NOT EXISTS `agent_platform`.`message` (
  `id`         CHAR(36)    NOT NULL,
  `session_id` CHAR(36)    NOT NULL,
  `type`       ENUM('user','system','tool','confirmation') NOT NULL,
  `role`       ENUM('user','assistant','system','tool')    NOT NULL DEFAULT 'user',
  `content`    JSON        NOT NULL,
  `seq`        INT         NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  CONSTRAINT `fk_message_session` FOREIGN KEY (`session_id`)
    REFERENCES `agent_platform`.`session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX `idx_message_session_id`     (`session_id`),
  INDEX `idx_message_session_seq`    (`session_id`, `seq`),
  INDEX `idx_message_type`           (`type`),
  INDEX `idx_message_created_at`     (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话消息';
