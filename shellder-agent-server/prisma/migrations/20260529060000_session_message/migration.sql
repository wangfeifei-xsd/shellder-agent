-- 阶段 08 — 会话与消息核心
-- CreateTable
CREATE TABLE `session` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `title` VARCHAR(256) NULL,
    `status` ENUM('active', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'active',
    `capability_type` ENUM('qa', 'query', 'action', 'workflow') NULL,
    `summary` TEXT NULL,
    `has_task` BOOLEAN NOT NULL DEFAULT false,
    `has_confirmation` BOOLEAN NOT NULL DEFAULT false,
    `last_message_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `session_tenant_id_idx`(`tenant_id`),
    INDEX `session_user_id_idx`(`user_id`),
    INDEX `session_status_idx`(`status`),
    INDEX `session_capability_type_idx`(`capability_type`),
    INDEX `session_tenant_id_status_idx`(`tenant_id`, `status`),
    INDEX `session_tenant_id_user_id_idx`(`tenant_id`, `user_id`),
    INDEX `session_last_message_at_idx`(`last_message_at`),
    INDEX `session_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `type` ENUM('user', 'system', 'tool', 'confirmation') NOT NULL,
    `role` ENUM('user', 'assistant', 'system', 'tool') NOT NULL DEFAULT 'user',
    `content` JSON NOT NULL,
    `seq` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_session_id_idx`(`session_id`),
    INDEX `message_session_id_seq_idx`(`session_id`, `seq`),
    INDEX `message_type_idx`(`type`),
    INDEX `message_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message` ADD CONSTRAINT `message_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
