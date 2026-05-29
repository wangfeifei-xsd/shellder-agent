-- 阶段 05 — 策略引擎与规则配置
-- CreateTable
CREATE TABLE `rule` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `type` ENUM('high_risk', 'confirm', 'capability_limit', 'custom') NOT NULL,
    `conditions` JSON NOT NULL,
    `action` ENUM('allow', 'deny', 'need_confirm', 'mark_high_risk') NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `description` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `rule_tenant_id_idx`(`tenant_id`),
    INDEX `rule_type_idx`(`type`),
    INDEX `rule_status_idx`(`status`),
    INDEX `rule_tenant_id_status_priority_idx`(`tenant_id`, `status`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rule_hit` (
    `id` CHAR(36) NOT NULL,
    `rule_id` CHAR(36) NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `rule_name` VARCHAR(128) NOT NULL,
    `rule_type` ENUM('high_risk', 'confirm', 'capability_limit', 'custom') NOT NULL,
    `rule_action` ENUM('allow', 'deny', 'need_confirm', 'mark_high_risk') NOT NULL,
    `result` VARCHAR(32) NOT NULL,
    `tool_name` VARCHAR(128) NULL,
    `capability` VARCHAR(32) NULL,
    `request_summary` TEXT NULL,
    `caller_user_id` CHAR(36) NULL,
    `session_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rule_hit_rule_id_idx`(`rule_id`),
    INDEX `rule_hit_tenant_id_idx`(`tenant_id`),
    INDEX `rule_hit_session_id_idx`(`session_id`),
    INDEX `rule_hit_task_id_idx`(`task_id`),
    INDEX `rule_hit_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rule` ADD CONSTRAINT `rule_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rule_hit` ADD CONSTRAINT `rule_hit_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `rule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rule_hit` ADD CONSTRAINT `rule_hit_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
