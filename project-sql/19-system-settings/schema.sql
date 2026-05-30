-- 目标库: agent_platform
USE `agent_platform`;

-- ============================================================
-- 阶段 18 — 系统设置（功能清单 §1.13）
-- 新增表：system_config、notification_template
-- 前序依赖：01-bootstrap（MySQL/Prisma 基线）、09-task-worker
-- ============================================================

-- 系统配置 KV 表
CREATE TABLE IF NOT EXISTS `agent_platform`.`system_config` (
  `id`           CHAR(36)     NOT NULL,
  `config_group` VARCHAR(64)  NOT NULL COMMENT '配置分组：basic / model / notification',
  `config_key`   VARCHAR(128) NOT NULL COMMENT '配置键，全局唯一',
  `config_value` TEXT         NOT NULL COMMENT '配置值（JSON 字符串或纯文本）',
  `description`  VARCHAR(512) NULL     COMMENT '配置说明',
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`),
  KEY `idx_config_group` (`config_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置 KV';

-- 通知模板表
CREATE TABLE IF NOT EXISTS `agent_platform`.`notification_template` (
  `id`            CHAR(36)     NOT NULL,
  `type`          ENUM('approval','task_complete','exception') NOT NULL COMMENT '模板类型',
  `name`          VARCHAR(128) NOT NULL COMMENT '模板名称',
  `subject`       VARCHAR(256) NULL     COMMENT '模板主题',
  `body`          TEXT         NOT NULL COMMENT '模板内容（支持 {{var}} 变量占位符）',
  `enabled`       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用',
  `connector_id`  CHAR(36)     NULL     COMMENT '关联通知连接器 ID（connector.type=notification）',
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_name` (`type`, `name`),
  KEY `idx_type` (`type`),
  KEY `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知模板';