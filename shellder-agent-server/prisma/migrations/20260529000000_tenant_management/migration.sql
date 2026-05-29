-- 阶段 02 — 租户管理
-- CreateTable
CREATE TABLE `tenant` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `external_tenant_id` VARCHAR(128) NULL,
    `config` JSON NULL,
    `admin_user_id` CHAR(36) NULL,
    `remark` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_code_key`(`code`),
    INDEX `tenant_status_idx`(`status`),
    INDEX `tenant_external_tenant_id_idx`(`external_tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
