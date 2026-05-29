-- 阶段 07 — 工具注册与工具管理
-- CreateTable
CREATE TABLE `tool` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `type` ENUM('query', 'action', 'workflow', 'notification') NOT NULL,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `input_schema` JSON NOT NULL,
    `output_schema` JSON NULL,
    `permission_scope` VARCHAR(128) NULL,
    `risk_level` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'low',
    `need_confirmation` BOOLEAN NOT NULL DEFAULT false,
    `timeout_ms` INTEGER NOT NULL DEFAULT 10000,
    `idempotency_key` VARCHAR(128) NULL,
    `audit_event_type` VARCHAR(128) NULL,
    `connector_id` CHAR(36) NULL,
    `config` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tool_tenant_id_idx`(`tenant_id`),
    INDEX `tool_type_idx`(`type`),
    INDEX `tool_status_idx`(`status`),
    INDEX `tool_risk_level_idx`(`risk_level`),
    INDEX `tool_connector_id_idx`(`connector_id`),
    INDEX `tool_tenant_id_type_status_idx`(`tenant_id`, `type`, `status`),
    UNIQUE INDEX `tool_tenant_id_name_key`(`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tool` ADD CONSTRAINT `tool_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tool` ADD CONSTRAINT `tool_connector_id_fkey` FOREIGN KEY (`connector_id`) REFERENCES `connector`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
