-- 阶段 20 — 嵌入式 Copilot
-- CreateTable
CREATE TABLE `copilot_config` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `app_id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `domain_whitelist` JSON NULL,
    `theme` JSON NULL,
    `features` JSON NULL,
    `welcome_message` TEXT NULL,
    `placeholder` VARCHAR(256) NULL,
    `max_history_messages` INTEGER NOT NULL DEFAULT 50,
    `token_ttl_seconds` INTEGER NOT NULL DEFAULT 3600,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `copilot_config_tenant_id_idx`(`tenant_id`),
    INDEX `copilot_config_status_idx`(`status`),
    UNIQUE INDEX `copilot_config_app_id_key`(`app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `copilot_config` ADD CONSTRAINT `copilot_config_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `copilot_config` ADD CONSTRAINT `copilot_config_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `openapi_app`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
