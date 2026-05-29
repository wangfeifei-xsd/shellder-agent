-- 阶段 06 — 连接器管理
-- CreateTable
CREATE TABLE `connector` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `type` ENUM('db_readonly', 'http', 'notification') NOT NULL,
    `target` VARCHAR(512) NOT NULL,
    `auth_type` VARCHAR(32) NOT NULL DEFAULT 'none',
    `timeout_ms` INTEGER NOT NULL DEFAULT 5000,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `config` JSON NOT NULL,
    `description` VARCHAR(512) NULL,
    `last_test_status` ENUM('success', 'failed') NULL,
    `last_test_latency_ms` INTEGER NULL,
    `last_test_message` VARCHAR(512) NULL,
    `last_tested_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `connector_tenant_id_idx`(`tenant_id`),
    INDEX `connector_type_idx`(`type`),
    INDEX `connector_status_idx`(`status`),
    INDEX `connector_tenant_id_type_status_idx`(`tenant_id`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `connector` ADD CONSTRAINT `connector_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
