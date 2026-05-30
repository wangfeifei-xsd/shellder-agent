-- 阶段 15 — 审批中心
-- CreateTable
CREATE TABLE `approval` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `message_id` CHAR(36) NULL,
    `initiator_id` CHAR(36) NULL,
    `initiator_name` VARCHAR(128) NULL,
    `action_type` VARCHAR(128) NOT NULL,
    `action_summary` TEXT NULL,
    `risk_level` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'high',
    `impact_scope` VARCHAR(512) NULL,
    `tool_ids` JSON NULL,
    `request_context` JSON NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'timeout') NOT NULL DEFAULT 'pending',
    `reviewer_id` CHAR(36) NULL,
    `reviewer_name` VARCHAR(128) NULL,
    `opinion` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `expired_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `approval_tenant_id_idx`(`tenant_id`),
    INDEX `approval_session_id_idx`(`session_id`),
    INDEX `approval_task_id_idx`(`task_id`),
    INDEX `approval_status_idx`(`status`),
    INDEX `approval_initiator_id_idx`(`initiator_id`),
    INDEX `approval_reviewer_id_idx`(`reviewer_id`),
    INDEX `approval_action_type_idx`(`action_type`),
    INDEX `approval_risk_level_idx`(`risk_level`),
    INDEX `approval_tenant_id_status_idx`(`tenant_id`, `status`),
    INDEX `approval_created_at_idx`(`created_at`),
    INDEX `approval_reviewed_at_idx`(`reviewed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `approval` ADD CONSTRAINT `approval_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
