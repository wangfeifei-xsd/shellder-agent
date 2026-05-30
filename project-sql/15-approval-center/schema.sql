-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 14 — 审批中心（Phase 14 / project-sql/15-approval-center）
-- 功能清单 §1.8 / 架构 §4.5 人工确认中断 / 执行计划 §5
-- 依赖：02-tenant-management（tenant 表）
--       08-session-message（session / message 表）
--       09-task-worker（task 表）
-- ================================================================
--
-- 设计要点：
-- 1. approval 表记录高风险动作待确认事项的全生命周期（创建→确认/驳回/超时）。
-- 2. 与 Agent Runtime 联动（执行计划 §4）：
--    - needConfirmation 命中 → 创建 approval 记录，session/task 状态 pending_confirm
--    - 确认 → Runtime 从断点继续执行 Tool
--    - 驳回 → 任务失败，Message 写入驳回原因
--    - 超时 → job-worker 定时标记超时（09）
-- 3. 按租户隔离（实施规格 §1.4）：tenant_id 必须来自 tenant 表。
-- 4. 审批操作记入用户操作审计（04）。
-- 5. 风险动作审计页聚合审批 + Tool 调用（04）。

-- CreateTable：审批记录
CREATE TABLE `agent_platform`.`approval` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`       CHAR(36)     NOT NULL COMMENT '所属租户 → tenant.id',
    `session_id`      CHAR(36)     NULL     COMMENT '关联会话 ID',
    `task_id`         CHAR(36)     NULL     COMMENT '关联任务 ID',
    `message_id`      CHAR(36)     NULL     COMMENT '关联确认消息 ID',
    `initiator_id`    CHAR(36)     NULL     COMMENT '发起人 user.id',
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

-- AddForeignKey
ALTER TABLE `agent_platform`.`approval` ADD CONSTRAINT `approval_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;