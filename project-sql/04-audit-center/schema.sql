-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 04 — 审计模块与审计中心
-- 依赖：02-tenant-management（tenant_id → tenant.id）、03-user-rbac（操作人 / 调用人取自 user）
-- 作用：新增三类审计采集通道表（工具调用 / 用户操作 / 外部接口）；
--      风险动作审计为聚合只读视图，不单独建表（执行计划 §3.4 / §5.2）。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529020000_audit_center/migration.sql
--
-- 设计要点：
-- 1. 所有写操作必须审计（架构 §8），用户操作审计由 AuditInterceptor + @Audit 装饰器自动采集。
-- 2. 所有外部系统调用必须记录（external_call_audit），06 连接器 / 13 业务能力起写入。
-- 3. tool_call_audit 表结构就绪，07 工具模块起写入真实数据。
-- 4. 审计为保留性数据，tenant_id 外键 ON DELETE RESTRICT；平台内租户只禁用不删除。
-- 5. 审计日志均建 created_at 索引以支撑时间范围查询（架构 §7）。

-- CreateTable：工具调用审计
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

-- CreateTable：用户操作审计
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

-- CreateTable：外部接口审计
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

-- AddForeignKey
ALTER TABLE `agent_platform`.`tool_call_audit` ADD CONSTRAINT `tool_call_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_action_audit` ADD CONSTRAINT `user_action_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`external_call_audit` ADD CONSTRAINT `external_call_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 风险动作审计：聚合只读视图，不建独立采集表。
-- V1 数据源 = tool_call_audit(high_risk = true)；14-审批中心 就绪后再 JOIN approval。
-- 参考应用层聚合（按 session_id / task_id 串联全链路）：
--   SELECT * FROM tool_call_audit WHERE high_risk = true ORDER BY created_at DESC;