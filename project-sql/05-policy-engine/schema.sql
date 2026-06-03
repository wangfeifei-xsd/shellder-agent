-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 05 — 策略引擎与规则配置
-- 依赖：02-tenant-management（rule.tenant_id / rule_hit.tenant_id → tenant.id）、
--      03-user-rbac（knowledge 菜单权限、rule.manage 模块权限；命中留痕 caller_user_id 取自 user）、
--      04-audit-center（写操作经 @Audit 落 user_action_audit）。
-- 作用：新增显式规则配置表（rule）与规则命中记录表（rule_hit），支撑 Policy 模块
--      （权限判断 / 风险等级 / 确认拦截，架构 §4.2）及功能清单 §1.7 规则部分。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529030000_policy_engine/migration.sql
--
-- 设计要点：
-- 1. 规则按租户隔离（实施规格 §1.4）：rule.tenant_id 必须来自 tenant 表，非空。
-- 2. priority 数值越小优先级越高；Policy 按 (priority ASC, created_at) 评估。
-- 3. conditions 为匹配条件 DSL（JSON），空对象 {} 表示租户内全量匹配；结构见 README。
-- 4. rule_hit 为命中留痕（审计性质）：rule 删除时 rule_id 置空（ON DELETE SET NULL），
--    并保留 rule_name / rule_type / rule_action 快照，确保命中历史不丢失（验收标准 2）。
-- 5. tenant_id 外键 ON DELETE RESTRICT，与审计一致；平台内租户只禁用不删除。
-- 6. 不包含 SQL 表白名单、行数限制等（属 SQL 查询工具配置，执行计划 §8 / §4.2「不包含」）。

-- CreateTable：显式规则配置（按租户）
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

-- CreateTable：规则命中记录
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

-- AddForeignKey
ALTER TABLE `agent_platform`.`rule` ADD CONSTRAINT `rule_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`rule_hit` ADD CONSTRAINT `rule_hit_rule_id_fkey`
    FOREIGN KEY (`rule_id`) REFERENCES `agent_platform`.`rule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`rule_hit` ADD CONSTRAINT `rule_hit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- conditions JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "match": "all" | "any",                       -- 子句匹配模式，默认 all
--   "toolNames": ["createOrder", "deleteUser"],   -- 命中 Tool 名称（精确）
--   "toolNameContains": "delete",                 -- Tool 名称包含匹配（忽略大小写）
--   "riskLevels": ["high"],                        -- 命中风险等级 low/medium/high
--   "capabilities": ["action", "workflow"],        -- 命中业务能力
--   "needConfirmation": true,                       -- 命中 Tool 自身 needConfirmation 标记
--   "permissionScopes": ["order:write"]            -- 命中 Tool 权限范围
-- }