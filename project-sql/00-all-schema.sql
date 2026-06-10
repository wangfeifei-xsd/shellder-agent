-- shellder-agent 全量建表
-- 目标库：agent_platform
-- 用法：mysql -h HOST -u USER -p < 00-all-schema.sql
USE `agent_platform`;

-- 02-tenant-management

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

-- 03-user-rbac

CREATE TABLE `agent_platform`.`user` (
    `id`            CHAR(36)     NOT NULL COMMENT '用户主键',
    `username`      VARCHAR(64)  NOT NULL COMMENT '登录用户名，平台内唯一',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'bcrypt 口令哈希',
    `display_name`  VARCHAR(128) NULL COMMENT '显示名',
    `email`         VARCHAR(128) NULL COMMENT '邮箱（可选）',
    `status`        ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/禁用；禁用后无法登录',
    `is_system`     BOOLEAN      NOT NULL DEFAULT false COMMENT '系统内置账号（不可删除）',
    `remark`        VARCHAR(512) NULL COMMENT '备注',
    `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`    DATETIME(3)  NOT NULL COMMENT '更新时间',

    UNIQUE INDEX `user_username_key` (`username`),
    INDEX `user_status_idx` (`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='平台用户账号';

CREATE TABLE `agent_platform`.`role` (
    `id`          CHAR(36)     NOT NULL COMMENT '角色主键',
    `code`        VARCHAR(64)  NOT NULL COMMENT '角色编码，平台内唯一',
    `name`        VARCHAR(128) NOT NULL COMMENT '角色名称',
    `description` VARCHAR(512) NULL COMMENT '角色描述',
    `menus`       JSON         NULL COMMENT '菜单权限 key 列表；["*"] 表示全部',
    `modules`     JSON         NULL COMMENT '模块（写）权限 key 列表',
    `tool_scopes` JSON         NULL COMMENT 'Tool 权限范围 key 列表；["*"] 表示全部',
    `policy`      JSON         NULL COMMENT '能力访问与高风险审批策略，见模块 README',
    `is_system`   BOOLEAN      NOT NULL DEFAULT false COMMENT '系统内置角色（不可删除）',
    `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`  DATETIME(3)  NOT NULL COMMENT '更新时间',

    UNIQUE INDEX `role_code_key` (`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='RBAC 角色';

CREATE TABLE `agent_platform`.`user_role` (
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,

    INDEX `user_role_role_id_idx` (`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='用户与角色关联';

CREATE TABLE `agent_platform`.`user_tenant` (
    `user_id`   CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,

    INDEX `user_tenant_tenant_id_idx` (`tenant_id`),
    PRIMARY KEY (`user_id`, `tenant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='用户与租户绑定';

ALTER TABLE `agent_platform`.`user_role` ADD CONSTRAINT `user_role_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `agent_platform`.`user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_role` ADD CONSTRAINT `user_role_role_id_fkey`
    FOREIGN KEY (`role_id`) REFERENCES `agent_platform`.`role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_tenant` ADD CONSTRAINT `user_tenant_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `agent_platform`.`user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_tenant` ADD CONSTRAINT `user_tenant_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 04-audit-center

CREATE TABLE `agent_platform`.`tool_call_audit` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`       CHAR(36)     NULL COMMENT '所属租户，→ tenant.id；平台级调用可空',
    `tool_id`         CHAR(36)     NULL COMMENT 'Tool 主键（07 工具注册）占位，暂不加外键',
    `tool_name`       VARCHAR(128) NOT NULL COMMENT 'Tool 名称',
    `caller_user_id`  VARCHAR(256) NULL COMMENT '调用人：管理端 user.id；Copilot 为 JWT sub',
    `caller_name`     VARCHAR(128) NULL COMMENT '调用人显示名快照',
    `session_id`      CHAR(36)     NULL COMMENT '会话 ID（08）占位，用于风险动作链路聚合',
    `task_id`         CHAR(36)     NULL COMMENT '任务 ID（09）占位',
    `request_summary` TEXT         NULL COMMENT '入参摘要（脱敏文本，非完整原始入参）',
    `status`          ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'pending' COMMENT '调用结果状态',
    `error_message`   VARCHAR(1024) NULL COMMENT '失败原因',
    `duration_ms`     INTEGER      NULL COMMENT '耗时（毫秒）',
    `high_risk`       BOOLEAN      NOT NULL DEFAULT false COMMENT '高风险标记，供风险动作审计聚合',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',

    INDEX `tool_call_audit_tenant_id_idx` (`tenant_id`),
    INDEX `tool_call_audit_tool_name_idx` (`tool_name`),
    INDEX `tool_call_audit_caller_user_id_idx` (`caller_user_id`),
    INDEX `tool_call_audit_status_idx` (`status`),
    INDEX `tool_call_audit_high_risk_idx` (`high_risk`),
    INDEX `tool_call_audit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='工具调用审计';

CREATE TABLE `agent_platform`.`user_action_audit` (
    `id`               CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`        CHAR(36)     NULL COMMENT '操作所属租户上下文（取顶栏当前操作租户）',
    `operator_user_id` CHAR(36)     NULL COMMENT '操作人 user.id',
    `operator_name`    VARCHAR(128) NULL COMMENT '操作人用户名快照',
    `action`           VARCHAR(128) NOT NULL COMMENT '操作标识，如 user.update / role.create',
    `module`           VARCHAR(64)  NULL COMMENT '模块权限 key，如 user.manage',
    `target_type`      VARCHAR(64)  NULL COMMENT '目标资源类型，如 user / role / tenant',
    `target_id`        VARCHAR(64)  NULL COMMENT '目标资源 ID',
    `summary`          VARCHAR(512) NULL COMMENT '操作摘要',
    `diff`             JSON         NULL COMMENT '操作前后差异摘要 { before?, after?, params?, body? }',
    `status`           ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'success' COMMENT '操作结果',
    `ip`               VARCHAR(64)  NULL COMMENT '来源 IP',
    `request_id`       VARCHAR(64)  NULL COMMENT '请求链路 ID（x-request-id）',
    `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',

    INDEX `user_action_audit_tenant_id_idx` (`tenant_id`),
    INDEX `user_action_audit_operator_user_id_idx` (`operator_user_id`),
    INDEX `user_action_audit_action_idx` (`action`),
    INDEX `user_action_audit_module_idx` (`module`),
    INDEX `user_action_audit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='用户操作审计';

CREATE TABLE `agent_platform`.`external_call_audit` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`       CHAR(36)     NULL COMMENT '所属租户，→ tenant.id',
    `connector_id`    CHAR(36)     NULL COMMENT '连接器主键（06）占位',
    `target`          VARCHAR(255) NOT NULL COMMENT '外部目标系统标识 / URL',
    `method`          VARCHAR(16)  NULL COMMENT '调用方法，如 HTTP 方法',
    `caller_user_id`  VARCHAR(256) NULL COMMENT '触发调用方：管理端 user.id；Copilot 为 JWT sub',
    `session_id`      CHAR(36)     NULL COMMENT '会话 ID（08）占位',
    `task_id`         CHAR(36)     NULL COMMENT '任务 ID（09）占位',
    `request_summary` TEXT         NULL COMMENT '请求摘要（脱敏）',
    `status`          ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'success' COMMENT '调用结果状态',
    `status_code`     INTEGER      NULL COMMENT '外部返回状态码（如 HTTP 状态码）',
    `duration_ms`     INTEGER      NULL COMMENT '耗时（毫秒）',
    `error_message`   VARCHAR(1024) NULL COMMENT '失败原因',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',

    INDEX `external_call_audit_tenant_id_idx` (`tenant_id`),
    INDEX `external_call_audit_target_idx` (`target`),
    INDEX `external_call_audit_status_idx` (`status`),
    INDEX `external_call_audit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='外部接口调用审计';

ALTER TABLE `agent_platform`.`tool_call_audit` ADD CONSTRAINT `tool_call_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_action_audit` ADD CONSTRAINT `user_action_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`external_call_audit` ADD CONSTRAINT `external_call_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 05-policy-engine

CREATE TABLE `agent_platform`.`rule` (
    `id`          CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`   CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `name`        VARCHAR(128) NOT NULL COMMENT '规则名称',
    `type`        ENUM('high_risk', 'confirm', 'capability_limit', 'custom') NOT NULL
                  COMMENT '规则类型：高风险识别/确认拦截/能力级限制/通用',
    `conditions`  JSON         NOT NULL COMMENT '匹配条件 DSL（JSON），{} 表示租户内全量匹配',
    `action`      ENUM('allow', 'deny', 'need_confirm', 'mark_high_risk') NOT NULL
                  COMMENT '命中处置：放行/拦截/需确认/标记高风险',
    `priority`    INTEGER      NOT NULL DEFAULT 100 COMMENT '优先级，数值越小越优先',
    `status`      ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
    `description` VARCHAR(512) NULL COMMENT '规则说明',
    `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`  DATETIME(3)  NOT NULL COMMENT '更新时间',

    INDEX `rule_tenant_id_idx` (`tenant_id`),
    INDEX `rule_type_idx` (`type`),
    INDEX `rule_status_idx` (`status`),
    INDEX `rule_tenant_id_status_priority_idx` (`tenant_id`, `status`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='策略规则配置';

CREATE TABLE `agent_platform`.`rule_hit` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `rule_id`         CHAR(36)     NULL COMMENT '命中规则 → rule.id；规则删除后置空，保留快照',
    `tenant_id`       CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `rule_name`       VARCHAR(128) NOT NULL COMMENT '命中时规则名称快照',
    `rule_type`       ENUM('high_risk', 'confirm', 'capability_limit', 'custom') NOT NULL COMMENT '命中时规则类型快照',
    `rule_action`     ENUM('allow', 'deny', 'need_confirm', 'mark_high_risk') NOT NULL COMMENT '命中时规则动作快照',
    `result`          VARCHAR(32)  NOT NULL COMMENT '本次请求最终处置：allow/deny/need_confirm',
    `tool_name`       VARCHAR(128) NULL COMMENT '触发请求的 Tool 名称（07 起）',
    `capability`      VARCHAR(32)  NULL COMMENT '业务能力：qa/query/action/workflow',
    `request_summary` TEXT         NULL COMMENT '请求内容摘要（脱敏）',
    `caller_user_id`  VARCHAR(256) NULL COMMENT '触发方：管理端 user.id；Copilot 为 JWT sub',
    `session_id`      CHAR(36)     NULL COMMENT '会话 ID（08）占位',
    `task_id`         CHAR(36)     NULL COMMENT '任务 ID（09）占位',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '命中时间',

    INDEX `rule_hit_rule_id_idx` (`rule_id`),
    INDEX `rule_hit_tenant_id_idx` (`tenant_id`),
    INDEX `rule_hit_session_id_idx` (`session_id`),
    INDEX `rule_hit_task_id_idx` (`task_id`),
    INDEX `rule_hit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='策略规则命中记录';

ALTER TABLE `agent_platform`.`rule` ADD CONSTRAINT `rule_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`rule_hit` ADD CONSTRAINT `rule_hit_rule_id_fkey`
    FOREIGN KEY (`rule_id`) REFERENCES `agent_platform`.`rule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`rule_hit` ADD CONSTRAINT `rule_hit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 06-connector-management

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

-- 06b-connector-db-metadata

CREATE TABLE `agent_platform`.`connector_db_metadata` (
    `connector_id`          CHAR(36)     NOT NULL COMMENT '主键，→ connector.id',
    `introspected_schema`   JSON         NULL COMMENT '最近一次原始表结构抽取 JSON',
    `introspected_at`       DATETIME(3)  NULL COMMENT '抽取完成时间',
    `er_diagram_draft`      JSON         NULL COMMENT 'ER 关系图草稿 JSON（§4.3）',
    `er_diagram_published`  JSON         NULL COMMENT '已发布 ER 关系图；Runtime/NL2SQL 仅读此字段',
    `er_published_version`  INTEGER      NULL COMMENT '已发布版本号（单调递增）',
    `er_published_at`       DATETIME(3)  NULL COMMENT '最近发布时间',

    PRIMARY KEY (`connector_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='只读库连接器元数据（结构抽取与 ER 图）';

ALTER TABLE `agent_platform`.`connector_db_metadata` ADD CONSTRAINT `connector_db_metadata_connector_id_fkey`
    FOREIGN KEY (`connector_id`) REFERENCES `agent_platform`.`connector`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 07-tool-registry

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

-- 08-session-message

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

-- 09-task-worker

CREATE TABLE IF NOT EXISTS `agent_platform`.`task` (
  `id`               CHAR(36)     NOT NULL,
  `tenant_id`        CHAR(36)     NOT NULL,
  `session_id`       CHAR(36)     DEFAULT NULL,
  `user_id`          VARCHAR(256) DEFAULT NULL COMMENT '发起人：管理端 user.id；Copilot 为 JWT sub',
  `title`            VARCHAR(256) DEFAULT NULL,
  `type`             ENUM('sync','async','scheduled') NOT NULL DEFAULT 'async',
  `status`           ENUM('pending','running','completed','failed','cancelled','timeout','pending_confirm') NOT NULL DEFAULT 'pending',
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

  CONSTRAINT `fk_task_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

  INDEX `idx_task_tenant_id`           (`tenant_id`),
  INDEX `idx_task_session_id`          (`session_id`),
  INDEX `idx_task_user_id`             (`user_id`),
  INDEX `idx_task_status`              (`status`),
  INDEX `idx_task_type`                (`type`),
  INDEX `idx_task_capability_type`     (`capability_type`),
  INDEX `idx_task_tenant_status`       (`tenant_id`, `status`),
  INDEX `idx_task_tenant_type_status`  (`tenant_id`, `type`, `status`),
  INDEX `idx_task_job_id`              (`job_id`),
  INDEX `idx_task_created_at`          (`created_at`),
  INDEX `idx_task_cap_type_status_created` (`capability_type`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务';

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

  CONSTRAINT `fk_task_step_task` FOREIGN KEY (`task_id`)
    REFERENCES `agent_platform`.`task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX `idx_task_step_task_id`      (`task_id`),
  INDEX `idx_task_step_task_seq`     (`task_id`, `seq`),
  INDEX `idx_task_step_status`       (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务步骤';

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

  CONSTRAINT `fk_task_log_task` FOREIGN KEY (`task_id`)
    REFERENCES `agent_platform`.`task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX `idx_task_log_task_id`       (`task_id`),
  INDEX `idx_task_log_task_type`     (`task_id`, `type`),
  INDEX `idx_task_log_step_id`       (`step_id`),
  INDEX `idx_task_log_level`         (`level`),
  INDEX `idx_task_log_created_at`    (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务执行日志';

-- 10-capability-routing

CREATE TABLE IF NOT EXISTS `agent_platform`.`capability` (
  `id`                      CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`               CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
  `type`                    ENUM('qa', 'query', 'action', 'workflow') NOT NULL
                            COMMENT '能力类型：问答型/查询型/操作型/流程型',
  `name`                    VARCHAR(128) NOT NULL COMMENT '能力名称（租户内唯一）',
  `description`             VARCHAR(512) NULL COMMENT '能力描述',
  `applicable_system`       VARCHAR(256) NULL COMMENT '适用系统/业务场景',
  `dependent_tools`         JSON         NULL COMMENT '依赖的工具 ID 列表（string[]）',
  `permission_requirements` JSON         NULL COMMENT '权限要求（permissionScope 列表，string[]）',
  `priority`                INTEGER      NOT NULL DEFAULT 100 COMMENT '路由优先级，数值越小越优先',
  `status`                  ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
  `created_at`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`              DATETIME(3)  NOT NULL COMMENT '更新时间',

  UNIQUE INDEX `capability_tenant_id_name_key` (`tenant_id`, `name`),
  INDEX `capability_tenant_id_idx` (`tenant_id`),
  INDEX `capability_type_idx` (`type`),
  INDEX `capability_status_idx` (`status`),
  INDEX `capability_tenant_id_type_status_idx` (`tenant_id`, `type`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='能力目录';

CREATE TABLE IF NOT EXISTS `agent_platform`.`routing_rule` (
  `id`                CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`         CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
  `capability_id`     CHAR(36)     NOT NULL COMMENT '关联能力，→ capability.id',
  `name`              VARCHAR(128) NOT NULL COMMENT '规则名称',
  `description`       VARCHAR(512) NULL COMMENT '规则说明',
  `conditions`        JSON         NOT NULL COMMENT '匹配条件 DSL（JSON）：keywords/patterns/intents',
  `tool_ids`          JSON         NULL COMMENT '命中时可调用的工具 ID 列表（string[]）',
  `priority`          INTEGER      NOT NULL DEFAULT 100 COMMENT '同能力内优先级，数值越小越优先',
  `need_confirmation` BOOLEAN      NOT NULL DEFAULT false COMMENT '是否需人工确认（路由级）',
  `status`            ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`        DATETIME(3)  NOT NULL COMMENT '更新时间',

  INDEX `routing_rule_tenant_id_idx` (`tenant_id`),
  INDEX `routing_rule_capability_id_idx` (`capability_id`),
  INDEX `routing_rule_tenant_id_status_priority_idx` (`tenant_id`, `status`, `priority`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='能力路由规则';

ALTER TABLE `agent_platform`.`capability` ADD CONSTRAINT `capability_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_platform`.`routing_rule` ADD CONSTRAINT `routing_rule_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_platform`.`routing_rule` ADD CONSTRAINT `routing_rule_capability_id_fkey`
    FOREIGN KEY (`capability_id`) REFERENCES `agent_platform`.`capability`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 11-skill-management

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

-- 12-knowledge-base

CREATE TABLE IF NOT EXISTS `agent_platform`.`knowledge_base` (
  `id`                CHAR(36)     NOT NULL,
  `tenant_id`         CHAR(36)     NOT NULL,
  `name`              VARCHAR(128) NOT NULL,
  `description`       VARCHAR(512) DEFAULT NULL,
  `wiki_prefix`       VARCHAR(256) DEFAULT NULL COMMENT 'wiki 子路径前缀，如 tenants/{tenantId}/',
  `embedding_model`   VARCHAR(128) NOT NULL DEFAULT 'text-embedding-3-small',
  `similarity_metric` VARCHAR(32)  NOT NULL DEFAULT 'cosine',
  `chunk_strategy`    VARCHAR(32)  NOT NULL DEFAULT 'fixed_size',
  `chunk_size`        INT          NOT NULL DEFAULT 500,
  `chunk_overlap`     INT          NOT NULL DEFAULT 50,
  `status`            ENUM('active','disabled','deleted') NOT NULL DEFAULT 'active',
  `document_count`    INT          NOT NULL DEFAULT 0,
  `chunk_count`       INT          NOT NULL DEFAULT 0,
  `created_by`        CHAR(36)     DEFAULT NULL,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL,
  `deleted_at`        DATETIME(3)  DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `kb_tenant_name_key` (`tenant_id`, `name`),
  INDEX `idx_kb_tenant_id` (`tenant_id`),
  INDEX `idx_kb_status` (`status`),
  INDEX `idx_kb_tenant_status` (`tenant_id`, `status`),
  INDEX `idx_kb_created_at` (`created_at`),
  CONSTRAINT `fk_kb_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库租户绑定（wiki 代理）';

-- 15-approval-center

CREATE TABLE `agent_platform`.`approval` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`       CHAR(36)     NOT NULL COMMENT '所属租户 → tenant.id',
    `session_id`      CHAR(36)     NULL     COMMENT '关联会话 ID',
    `task_id`         CHAR(36)     NULL     COMMENT '关联任务 ID',
    `message_id`      CHAR(36)     NULL     COMMENT '关联确认消息 ID',
    `initiator_id`    VARCHAR(256) NULL     COMMENT '发起人：管理端 user.id；Copilot 为 JWT sub',
    `initiator_name`  VARCHAR(128) NULL     COMMENT '发起人名称快照',
    `action_type`     VARCHAR(128) NOT NULL COMMENT '动作类型/Tool 名称',
    `action_summary`  TEXT         NULL     COMMENT '动作摘要（操作背景、原始请求概要）',
    `risk_level`      ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'high'
                      COMMENT '风险等级',
    `impact_scope`    VARCHAR(512) NULL     COMMENT '影响范围描述',
    `tool_ids`        JSON         NULL     COMMENT '待执行 Tool ID 列表',
    `request_context` JSON         NULL     COMMENT '原始请求上下文（完整运行时上下文快照）',
    `status`          ENUM('pending', 'approved', 'rejected', 'timeout') NOT NULL DEFAULT 'pending'
                      COMMENT '审批状态：待确认/已确认/已驳回/已超时',
    `reviewer_id`     CHAR(36)     NULL     COMMENT '审批人 user.id',
    `reviewer_name`   VARCHAR(128) NULL     COMMENT '审批人名称快照',
    `opinion`         TEXT         NULL     COMMENT '审批意见',
    `reviewed_at`     DATETIME(3)  NULL     COMMENT '审批时间',
    `expired_at`      DATETIME(3)  NULL     COMMENT '超时时间（由创建时计算）',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',

    INDEX `approval_tenant_id_idx` (`tenant_id`),
    INDEX `approval_session_id_idx` (`session_id`),
    INDEX `approval_task_id_idx` (`task_id`),
    INDEX `approval_status_idx` (`status`),
    INDEX `approval_initiator_id_idx` (`initiator_id`),
    INDEX `approval_reviewer_id_idx` (`reviewer_id`),
    INDEX `approval_action_type_idx` (`action_type`),
    INDEX `approval_risk_level_idx` (`risk_level`),
    INDEX `approval_tenant_status_idx` (`tenant_id`, `status`),
    INDEX `approval_created_at_idx` (`created_at`),
    INDEX `approval_reviewed_at_idx` (`reviewed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='高风险动作审批';

ALTER TABLE `agent_platform`.`approval` ADD CONSTRAINT `approval_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 16-openapi

CREATE TABLE IF NOT EXISTS `agent_platform`.`openapi_app` (
  `id`                 CHAR(36)     NOT NULL,
  `name`               VARCHAR(128) NOT NULL,
  `description`        VARCHAR(512) NULL,
  `client_id`          VARCHAR(64)  NOT NULL,
  `client_secret_hash` VARCHAR(255) NOT NULL,
  `status`             ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `allowed_tenant_ids` JSON         NOT NULL,
  `allowed_capabilities` JSON       NOT NULL,
  `rate_limit_config`  JSON         NULL,
  `last_called_at`     DATETIME(3)  NULL,
  `created_by`         CHAR(36)     NULL,
  `created_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`         DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `openapi_app_name_key` (`name`),
  UNIQUE KEY `openapi_app_client_id_key` (`client_id`),
  INDEX `openapi_app_client_id_idx` (`client_id`),
  INDEX `openapi_app_status_idx` (`status`),
  INDEX `openapi_app_created_at_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OpenAPI 接入应用';

CREATE TABLE IF NOT EXISTS `agent_platform`.`openapi_call_log` (
  `id`              CHAR(36)     NOT NULL,
  `app_id`          CHAR(36)     NOT NULL,
  `tenant_id`       CHAR(36)     NULL,
  `method`          VARCHAR(10)  NOT NULL,
  `path`            VARCHAR(256) NOT NULL,
  `status_code`     INT          NOT NULL,
  `status`          ENUM('success','failed','rate_limited') NOT NULL DEFAULT 'success',
  `ip`              VARCHAR(64)  NULL,
  `duration_ms`     INT          NULL,
  `error_message`   VARCHAR(1024) NULL,
  `request_summary` TEXT         NULL,
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `openapi_call_log_app_id_idx` (`app_id`),
  INDEX `openapi_call_log_tenant_id_idx` (`tenant_id`),
  INDEX `openapi_call_log_status_idx` (`status`),
  INDEX `openapi_call_log_path_idx` (`path`),
  INDEX `openapi_call_log_created_at_idx` (`created_at`),
  INDEX `openapi_call_log_app_id_status_idx` (`app_id`, `status`),
  INDEX `openapi_call_log_app_id_created_at_idx` (`app_id`, `created_at`),
  CONSTRAINT `openapi_call_log_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `agent_platform`.`openapi_app`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `openapi_call_log_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OpenAPI 调用日志';

-- 19-system-settings

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

-- 20-embedded-copilot

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

-- 21-prompt-management

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

