-- 阶段 11 — 技能书管理
-- CreateTable
CREATE TABLE `skill` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `category` VARCHAR(64) NULL,
    `capability_type` ENUM('qa', 'query', 'action', 'workflow') NOT NULL,
    `status` ENUM('draft', 'enabled', 'disabled') NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `risk_level` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'low',
    `need_confirmation` BOOLEAN NOT NULL DEFAULT false,
    `permission_scope` VARCHAR(128) NULL,
    `entry_mode` ENUM('tool', 'workflow') NOT NULL,
    `entry_tool_id` CHAR(36) NULL,
    `workflow_tool_id` CHAR(36) NULL,
    `input_schema` JSON NULL,
    `output_schema` JSON NULL,
    `preconditions` JSON NULL,
    `result_template` TEXT NULL,
    `missing_param_strategy` JSON NULL,
    `failure_hint` VARCHAR(512) NULL,
    `remark` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `skill_tenant_id_idx`(`tenant_id`),
    INDEX `skill_capability_type_idx`(`capability_type`),
    INDEX `skill_status_idx`(`status`),
    INDEX `skill_risk_level_idx`(`risk_level`),
    INDEX `skill_tenant_id_capability_type_status_idx`(`tenant_id`, `capability_type`, `status`),
    UNIQUE INDEX `skill_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_trigger` (
    `id` CHAR(36) NOT NULL,
    `skill_id` CHAR(36) NOT NULL,
    `trigger_text` VARCHAR(512) NOT NULL,
    `trigger_type` VARCHAR(32) NOT NULL DEFAULT 'keyword',
    `priority` INTEGER NOT NULL DEFAULT 100,

    INDEX `skill_trigger_skill_id_idx`(`skill_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_binding` (
    `id` CHAR(36) NOT NULL,
    `skill_id` CHAR(36) NOT NULL,
    `binding_type` VARCHAR(32) NOT NULL,
    `target_id` CHAR(36) NOT NULL,
    `order_no` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,

    INDEX `skill_binding_skill_id_idx`(`skill_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_execution_log` (
    `id` CHAR(36) NOT NULL,
    `skill_id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `status` ENUM('success', 'failed', 'running', 'timeout') NOT NULL DEFAULT 'running',
    `input_snapshot` JSON NULL,
    `output_snapshot` JSON NULL,
    `error_summary` VARCHAR(1024) NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,

    INDEX `skill_execution_log_skill_id_idx`(`skill_id`),
    INDEX `skill_execution_log_tenant_id_idx`(`tenant_id`),
    INDEX `skill_execution_log_session_id_idx`(`session_id`),
    INDEX `skill_execution_log_task_id_idx`(`task_id`),
    INDEX `skill_execution_log_user_id_idx`(`user_id`),
    INDEX `skill_execution_log_status_idx`(`status`),
    INDEX `skill_execution_log_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `skill` ADD CONSTRAINT `skill_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_trigger` ADD CONSTRAINT `skill_trigger_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_binding` ADD CONSTRAINT `skill_binding_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_execution_log` ADD CONSTRAINT `skill_execution_log_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_execution_log` ADD CONSTRAINT `skill_execution_log_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
