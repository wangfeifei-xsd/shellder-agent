-- CreateTable
CREATE TABLE `prompt_template` (
    `id` CHAR(36) NOT NULL,
    `prompt_key` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `category` ENUM('qa', 'query', 'connector', 'routing', 'runtime', 'common') NOT NULL,
    `role` ENUM('system', 'user', 'fragment') NOT NULL,
    `scope` ENUM('global', 'tenant') NOT NULL DEFAULT 'global',
    `tenant_id` CHAR(36) NULL,
    `variable_schema` JSON NULL,
    `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prompt_template_prompt_key_scope_tenant_id_key`(`prompt_key`, `scope`, `tenant_id`),
    INDEX `prompt_template_category_idx`(`category`),
    INDEX `prompt_template_status_idx`(`status`),
    INDEX `prompt_template_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_version` (
    `id` CHAR(36) NOT NULL,
    `template_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `content_hash` CHAR(64) NOT NULL,
    `changelog` VARCHAR(512) NULL,
    `state` ENUM('draft', 'published', 'deprecated') NOT NULL DEFAULT 'draft',
    `published_at` DATETIME(3) NULL,
    `published_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prompt_version_template_id_state_idx`(`template_id`, `state`),
    UNIQUE INDEX `prompt_version_template_id_version_key`(`template_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_binding` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NULL,
    `bind_type` ENUM('capability', 'skill', 'tool', 'connector', 'default') NOT NULL,
    `bind_id` CHAR(36) NULL,
    `prompt_key` VARCHAR(128) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prompt_binding_tenant_id_idx`(`tenant_id`),
    INDEX `prompt_binding_bind_type_bind_id_tenant_id_idx`(`bind_type`, `bind_id`, `tenant_id`),
    INDEX `prompt_binding_prompt_key_idx`(`prompt_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prompt_template` ADD CONSTRAINT `prompt_template_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_version` ADD CONSTRAINT `prompt_version_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `prompt_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_binding` ADD CONSTRAINT `prompt_binding_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
