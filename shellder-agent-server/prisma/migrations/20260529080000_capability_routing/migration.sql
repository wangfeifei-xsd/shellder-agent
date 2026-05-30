-- 阶段 10 — 能力路由
-- CreateTable
CREATE TABLE `capability` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `type` ENUM('qa', 'query', 'action', 'workflow') NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `applicable_system` VARCHAR(256) NULL,
    `dependent_tools` JSON NULL,
    `permission_requirements` JSON NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `capability_tenant_id_idx`(`tenant_id`),
    INDEX `capability_type_idx`(`type`),
    INDEX `capability_status_idx`(`status`),
    INDEX `capability_tenant_id_type_status_idx`(`tenant_id`, `type`, `status`),
    UNIQUE INDEX `capability_tenant_id_name_key`(`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `routing_rule` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `capability_id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `conditions` JSON NOT NULL,
    `tool_ids` JSON NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `need_confirmation` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `routing_rule_tenant_id_idx`(`tenant_id`),
    INDEX `routing_rule_capability_id_idx`(`capability_id`),
    INDEX `routing_rule_tenant_id_status_priority_idx`(`tenant_id`, `status`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `capability` ADD CONSTRAINT `capability_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `routing_rule` ADD CONSTRAINT `routing_rule_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `routing_rule` ADD CONSTRAINT `routing_rule_capability_id_fkey` FOREIGN KEY (`capability_id`) REFERENCES `capability`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
