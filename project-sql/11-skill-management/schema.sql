-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 11 — 技能书管理（功能清单 §1.5A / 架构 Skill Management）
-- 依赖：01-bootstrap, 02-tenant-management, 07-tool-registry, 10-capability-routing
-- ================================================================

-- 技能书主表
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill` (
  `id`                     CHAR(36)     NOT NULL,
  `tenant_id`              CHAR(36)     NOT NULL,
  `code`                   VARCHAR(64)  NOT NULL,
  `name`                   VARCHAR(128) NOT NULL,
  `description`            VARCHAR(512) DEFAULT NULL,
  `category`               VARCHAR(64)  DEFAULT NULL,
  `capability_type`        ENUM('qa','query','action','workflow') NOT NULL,
  `status`                 ENUM('draft','enabled','disabled') NOT NULL DEFAULT 'draft',
  `version`                INT          NOT NULL DEFAULT 1,
  `risk_level`             ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  `need_confirmation`      TINYINT(1)   NOT NULL DEFAULT 0,
  `permission_scope`       VARCHAR(128) DEFAULT NULL,
  `entry_mode`             ENUM('tool','workflow') NOT NULL,
  `entry_tool_id`          CHAR(36)     DEFAULT NULL,
  `workflow_tool_id`       CHAR(36)     DEFAULT NULL,
  `input_schema`           JSON         DEFAULT NULL,
  `output_schema`          JSON         DEFAULT NULL,
  `preconditions`          JSON         DEFAULT NULL,
  `result_template`        TEXT         DEFAULT NULL,
  `missing_param_strategy` JSON         DEFAULT NULL,
  `failure_hint`           VARCHAR(512) DEFAULT NULL,
  `remark`                 VARCHAR(512) DEFAULT NULL,
  `created_at`             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`             DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `skill_tenant_id_code_key` (`tenant_id`, `code`),
  INDEX `idx_skill_tenant_id` (`tenant_id`),
  INDEX `idx_skill_capability_type` (`capability_type`),
  INDEX `idx_skill_status` (`status`),
  INDEX `idx_skill_risk_level` (`risk_level`),
  INDEX `idx_skill_tenant_cap_status` (`tenant_id`, `capability_type`, `status`),
  CONSTRAINT `fk_skill_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书';

-- 技能书触发示例
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill_trigger` (
  `id`           CHAR(36)     NOT NULL,
  `skill_id`     CHAR(36)     NOT NULL,
  `trigger_text` VARCHAR(512) NOT NULL,
  `trigger_type` VARCHAR(32)  NOT NULL DEFAULT 'keyword',
  `priority`     INT          NOT NULL DEFAULT 100,
  PRIMARY KEY (`id`),
  INDEX `idx_skill_trigger_skill_id` (`skill_id`),
  CONSTRAINT `fk_skill_trigger_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书触发示例';

-- 技能书绑定关系
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill_binding` (
  `id`           CHAR(36)    NOT NULL,
  `skill_id`     CHAR(36)    NOT NULL,
  `binding_type` VARCHAR(32) NOT NULL,
  `target_id`    CHAR(36)    NOT NULL,
  `order_no`     INT         NOT NULL DEFAULT 0,
  `config`       JSON        DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_skill_binding_skill_id` (`skill_id`),
  CONSTRAINT `fk_skill_binding_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书绑定关系';

-- 技能书执行记录
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill_execution_log` (
  `id`              CHAR(36)      NOT NULL,
  `skill_id`        CHAR(36)      NOT NULL,
  `session_id`      CHAR(36)      DEFAULT NULL,
  `task_id`         CHAR(36)      DEFAULT NULL,
  `tenant_id`       CHAR(36)      NOT NULL,
  `user_id`         VARCHAR(256)  DEFAULT NULL COMMENT '执行人：管理端 user.id；Copilot 为 JWT sub',
  `status`          ENUM('success','failed','running','timeout') NOT NULL DEFAULT 'running',
  `input_snapshot`  JSON          DEFAULT NULL,
  `output_snapshot` JSON          DEFAULT NULL,
  `error_summary`   VARCHAR(1024) DEFAULT NULL,
  `started_at`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at`     DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_sel_skill_id` (`skill_id`),
  INDEX `idx_sel_tenant_id` (`tenant_id`),
  INDEX `idx_sel_session_id` (`session_id`),
  INDEX `idx_sel_task_id` (`task_id`),
  INDEX `idx_sel_user_id` (`user_id`),
  INDEX `idx_sel_status` (`status`),
  INDEX `idx_sel_started_at` (`started_at`),
  CONSTRAINT `fk_sel_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_sel_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书执行记录';