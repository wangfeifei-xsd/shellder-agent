-- 阶段 04 — 审计模块与审计中心
-- CreateTable
CREATE TABLE `tool_call_audit` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NULL,
    `tool_id` CHAR(36) NULL,
    `tool_name` VARCHAR(128) NOT NULL,
    `caller_user_id` CHAR(36) NULL,
    `caller_name` VARCHAR(128) NULL,
    `session_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `request_summary` TEXT NULL,
    `status` ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'pending',
    `error_message` VARCHAR(1024) NULL,
    `duration_ms` INTEGER NULL,
    `high_risk` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tool_call_audit_tenant_id_idx`(`tenant_id`),
    INDEX `tool_call_audit_tool_name_idx`(`tool_name`),
    INDEX `tool_call_audit_caller_user_id_idx`(`caller_user_id`),
    INDEX `tool_call_audit_status_idx`(`status`),
    INDEX `tool_call_audit_high_risk_idx`(`high_risk`),
    INDEX `tool_call_audit_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_action_audit` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NULL,
    `operator_user_id` CHAR(36) NULL,
    `operator_name` VARCHAR(128) NULL,
    `action` VARCHAR(128) NOT NULL,
    `module` VARCHAR(64) NULL,
    `target_type` VARCHAR(64) NULL,
    `target_id` VARCHAR(64) NULL,
    `summary` VARCHAR(512) NULL,
    `diff` JSON NULL,
    `status` ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'success',
    `ip` VARCHAR(64) NULL,
    `request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_action_audit_tenant_id_idx`(`tenant_id`),
    INDEX `user_action_audit_operator_user_id_idx`(`operator_user_id`),
    INDEX `user_action_audit_action_idx`(`action`),
    INDEX `user_action_audit_module_idx`(`module`),
    INDEX `user_action_audit_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `external_call_audit` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NULL,
    `connector_id` CHAR(36) NULL,
    `target` VARCHAR(255) NOT NULL,
    `method` VARCHAR(16) NULL,
    `caller_user_id` CHAR(36) NULL,
    `session_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `request_summary` TEXT NULL,
    `status` ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'success',
    `status_code` INTEGER NULL,
    `duration_ms` INTEGER NULL,
    `error_message` VARCHAR(1024) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `external_call_audit_tenant_id_idx`(`tenant_id`),
    INDEX `external_call_audit_target_idx`(`target`),
    INDEX `external_call_audit_status_idx`(`status`),
    INDEX `external_call_audit_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tool_call_audit` ADD CONSTRAINT `tool_call_audit_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_action_audit` ADD CONSTRAINT `user_action_audit_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `external_call_audit` ADD CONSTRAINT `external_call_audit_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
