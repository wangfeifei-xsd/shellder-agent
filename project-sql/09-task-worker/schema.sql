-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 09 — 任务中心与异步 Worker
-- 功能清单 §1.3 / §4.3 Task / §4.11 异步执行
-- 依赖：02-tenant-management（tenant 表）、08-session-message（session 表）
-- ================================================================

-- 任务表（Task 模块）
CREATE TABLE IF NOT EXISTS `agent_platform`.`task` (
  `id`               CHAR(36)     NOT NULL,
  `tenant_id`        CHAR(36)     NOT NULL,
  `session_id`       CHAR(36)     DEFAULT NULL,
  `user_id`          VARCHAR(256) DEFAULT NULL COMMENT '发起人：管理端 user.id；Copilot 为 JWT sub',
  `title`            VARCHAR(256) DEFAULT NULL,
  `type`             ENUM('sync','async','scheduled') NOT NULL DEFAULT 'async',
  `status`           ENUM('pending','running','completed','failed','cancelled','timeout') NOT NULL DEFAULT 'pending',
  `capability_type`  ENUM('qa','query','action','workflow') DEFAULT NULL,
  `current_node`     VARCHAR(256) DEFAULT NULL,
  `input`            JSON         DEFAULT NULL,
  `output`           JSON         DEFAULT NULL,
  `retry_count`      INT          NOT NULL DEFAULT 0,
  `max_retries`      INT          NOT NULL DEFAULT 3,
  `timeout_ms`       INT          NOT NULL DEFAULT 300000,
  `fail_reason`      TEXT         DEFAULT NULL,
  `job_id`           VARCHAR(128) DEFAULT NULL,
  `scheduled_at`     DATETIME(3)  DEFAULT NULL,
  `started_at`       DATETIME(3)  DEFAULT NULL,
  `completed_at`     DATETIME(3)  DEFAULT NULL,
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 租户外键（任务为保留性数据，Restrict）
  CONSTRAINT `fk_task_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

  -- 索引（与 Prisma schema 对齐）
  INDEX `idx_task_tenant_id`           (`tenant_id`),
  INDEX `idx_task_session_id`          (`session_id`),
  INDEX `idx_task_user_id`             (`user_id`),
  INDEX `idx_task_status`              (`status`),
  INDEX `idx_task_type`                (`type`),
  INDEX `idx_task_capability_type`     (`capability_type`),
  INDEX `idx_task_tenant_status`       (`tenant_id`, `status`),
  INDEX `idx_task_tenant_type_status`  (`tenant_id`, `type`, `status`),
  INDEX `idx_task_job_id`              (`job_id`),
  INDEX `idx_task_created_at`          (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务';


-- 任务步骤表（长任务跟踪 §5.3）
CREATE TABLE IF NOT EXISTS `agent_platform`.`task_step` (
  `id`            CHAR(36)     NOT NULL,
  `task_id`       CHAR(36)     NOT NULL,
  `seq`           INT          NOT NULL DEFAULT 0,
  `name`          VARCHAR(256) NOT NULL,
  `description`   VARCHAR(512) DEFAULT NULL,
  `status`        ENUM('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `input`         JSON         DEFAULT NULL,
  `output`        JSON         DEFAULT NULL,
  `tool_name`     VARCHAR(128) DEFAULT NULL,
  `fail_reason`   TEXT         DEFAULT NULL,
  `duration_ms`   INT          DEFAULT NULL,
  `started_at`    DATETIME(3)  DEFAULT NULL,
  `completed_at`  DATETIME(3)  DEFAULT NULL,
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 级联删除：任务删除时关联步骤一并清理
  CONSTRAINT `fk_task_step_task` FOREIGN KEY (`task_id`)
    REFERENCES `agent_platform`.`task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  -- 索引
  INDEX `idx_task_step_task_id`      (`task_id`),
  INDEX `idx_task_step_task_seq`     (`task_id`, `seq`),
  INDEX `idx_task_step_status`       (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务步骤';


-- 任务执行日志表（§5.4 执行日志）
CREATE TABLE IF NOT EXISTS `agent_platform`.`task_log` (
  `id`         CHAR(36)    NOT NULL,
  `task_id`    CHAR(36)    NOT NULL,
  `step_id`    CHAR(36)    DEFAULT NULL,
  `type`       ENUM('state_change','tool_call','error','confirmation','notification','retry','custom') NOT NULL,
  `level`      ENUM('info','warn','error') NOT NULL DEFAULT 'info',
  `message`    TEXT        NOT NULL,
  `detail`     JSON        DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 级联删除：任务删除时关联日志一并清理
  CONSTRAINT `fk_task_log_task` FOREIGN KEY (`task_id`)
    REFERENCES `agent_platform`.`task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  -- 索引
  INDEX `idx_task_log_task_id`       (`task_id`),
  INDEX `idx_task_log_task_type`     (`task_id`, `type`),
  INDEX `idx_task_log_step_id`       (`step_id`),
  INDEX `idx_task_log_level`         (`level`),
  INDEX `idx_task_log_created_at`    (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务执行日志';