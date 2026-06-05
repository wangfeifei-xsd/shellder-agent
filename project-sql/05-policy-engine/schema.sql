USE `agent_platform`;

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
