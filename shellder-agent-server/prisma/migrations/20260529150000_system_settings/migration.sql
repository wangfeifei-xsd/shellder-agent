-- 阶段 19 — 系统设置
-- CreateTable
CREATE TABLE `system_config` (
    `id` CHAR(36) NOT NULL,
    `config_group` VARCHAR(64) NOT NULL,
    `config_key` VARCHAR(128) NOT NULL,
    `config_value` TEXT NOT NULL,
    `description` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `system_config_config_group_idx`(`config_group`),
    UNIQUE INDEX `system_config_config_key_key`(`config_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_template` (
    `id` CHAR(36) NOT NULL,
    `type` ENUM('approval', 'task_complete', 'exception') NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `subject` VARCHAR(256) NULL,
    `body` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `connector_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `notification_template_type_idx`(`type`),
    INDEX `notification_template_enabled_idx`(`enabled`),
    UNIQUE INDEX `notification_template_type_name_key`(`type`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
