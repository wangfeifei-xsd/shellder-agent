-- 目标库: agent_platform
USE `agent_platform`;

-- ============================================================
-- 阶段 21 — Prompt 管理（方案 §5.3）
-- 新增表：prompt_template、prompt_version、prompt_binding
-- 前序依赖：02-tenant-management、03-user-rbac、04-audit-center、18-system-settings
-- ============================================================

-- 逻辑模板（SSOT 元数据）
CREATE TABLE IF NOT EXISTS `agent_platform`.`prompt_template` (
  `id`               CHAR(36)     NOT NULL COMMENT '主键',
  `prompt_key`       VARCHAR(128) NOT NULL COMMENT '全局逻辑键，如 query.nl2sql.system',
  `name`             VARCHAR(128) NOT NULL COMMENT '展示名',
  `description`      VARCHAR(512) NULL     COMMENT '说明、适用链路',
  `category`         ENUM('qa','query','sql_conversion','connector','routing','runtime','common') NOT NULL COMMENT '分类',
  `role`             ENUM('system','user','fragment') NOT NULL COMMENT 'LLM 消息角色',
  `scope`            ENUM('global','tenant') NOT NULL DEFAULT 'global' COMMENT '作用域',
  `tenant_id`        CHAR(36)     NULL     COMMENT 'scope=tenant 时必填 → tenant.id',
  `variable_schema`  JSON         NULL     COMMENT '变量 JSON Schema',
  `status`           ENUM('active','archived') NOT NULL DEFAULT 'active' COMMENT '模板状态',
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prompt_key_scope_tenant` (`prompt_key`, `scope`, `tenant_id`),
  KEY `idx_prompt_category` (`category`),
  KEY `idx_prompt_status` (`status`),
  KEY `idx_prompt_tenant` (`tenant_id`),
  CONSTRAINT `prompt_template_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prompt 逻辑模板';

-- 不可变版本（正文与发布状态）
CREATE TABLE IF NOT EXISTS `agent_platform`.`prompt_version` (
  `id`            CHAR(36)     NOT NULL COMMENT '主键',
  `template_id`   CHAR(36)     NOT NULL COMMENT '→ prompt_template.id',
  `version`       INT          NOT NULL COMMENT '递增版本号',
  `content`       MEDIUMTEXT   NOT NULL COMMENT '模板正文，支持 {{var}}',
  `content_hash`  CHAR(64)     NOT NULL COMMENT 'SHA-256 内容摘要',
  `changelog`     VARCHAR(512) NULL     COMMENT '变更说明',
  `state`         ENUM('draft','published','deprecated') NOT NULL DEFAULT 'draft' COMMENT '版本状态',
  `published_at`  DATETIME(3)  NULL     COMMENT '发布时间',
  `published_by`  CHAR(36)     NULL     COMMENT '发布人用户 ID',
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_version` (`template_id`, `version`),
  KEY `idx_prompt_version_state` (`template_id`, `state`),
  CONSTRAINT `prompt_version_template_id_fkey`
    FOREIGN KEY (`template_id`) REFERENCES `agent_platform`.`prompt_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prompt 模板版本';

-- 业务锚点 → 逻辑键绑定（可选租户覆盖）
CREATE TABLE IF NOT EXISTS `agent_platform`.`prompt_binding` (
  `id`          CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`   CHAR(36)     NULL     COMMENT '租户覆盖，NULL 表示全局默认',
  `bind_type`   ENUM('capability','skill','tool','connector','default') NOT NULL COMMENT '绑定类型',
  `bind_id`     CHAR(36)     NULL     COMMENT '业务对象 ID，可空',
  `prompt_key`  VARCHAR(128) NOT NULL COMMENT '引用的逻辑键',
  `priority`    INT          NOT NULL DEFAULT 0 COMMENT '多绑定优先级，越大越优先',
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_prompt_binding_tenant` (`tenant_id`),
  KEY `idx_prompt_binding_lookup` (`bind_type`, `bind_id`, `tenant_id`),
  KEY `idx_prompt_binding_key` (`prompt_key`),
  CONSTRAINT `prompt_binding_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prompt 业务绑定';
