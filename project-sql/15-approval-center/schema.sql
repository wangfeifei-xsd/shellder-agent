USE `agent_platform`;

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
