-- 阶段 16 — OpenAPI 对外接口与管理
-- CreateTable
CREATE TABLE `openapi_app` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `client_id` VARCHAR(64) NOT NULL,
    `client_secret_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `allowed_tenant_ids` JSON NOT NULL,
    `allowed_capabilities` JSON NOT NULL,
    `rate_limit_config` JSON NULL,
    `last_called_at` DATETIME(3) NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `openapi_app_client_id_idx`(`client_id`),
    INDEX `openapi_app_status_idx`(`status`),
    INDEX `openapi_app_created_at_idx`(`created_at`),
    UNIQUE INDEX `openapi_app_name_key`(`name`),
    UNIQUE INDEX `openapi_app_client_id_key`(`client_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `openapi_call_log` (
    `id` CHAR(36) NOT NULL,
    `app_id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NULL,
    `method` VARCHAR(10) NOT NULL,
    `path` VARCHAR(256) NOT NULL,
    `status_code` INTEGER NOT NULL,
    `status` ENUM('success', 'failed', 'rate_limited') NOT NULL DEFAULT 'success',
    `ip` VARCHAR(64) NULL,
    `duration_ms` INTEGER NULL,
    `error_message` VARCHAR(1024) NULL,
    `request_summary` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `openapi_call_log_app_id_idx`(`app_id`),
    INDEX `openapi_call_log_tenant_id_idx`(`tenant_id`),
    INDEX `openapi_call_log_status_idx`(`status`),
    INDEX `openapi_call_log_path_idx`(`path`),
    INDEX `openapi_call_log_created_at_idx`(`created_at`),
    INDEX `openapi_call_log_app_id_status_idx`(`app_id`, `status`),
    INDEX `openapi_call_log_app_id_created_at_idx`(`app_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `openapi_call_log` ADD CONSTRAINT `openapi_call_log_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `openapi_app`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `openapi_call_log` ADD CONSTRAINT `openapi_call_log_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
