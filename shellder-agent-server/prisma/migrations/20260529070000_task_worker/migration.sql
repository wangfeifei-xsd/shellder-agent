-- 阶段 09 — 任务中心与异步 Worker
-- CreateTable
CREATE TABLE `task` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `title` VARCHAR(256) NULL,
    `type` ENUM('sync', 'async', 'scheduled') NOT NULL DEFAULT 'async',
    `status` ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout') NOT NULL DEFAULT 'pending',
    `capability_type` ENUM('qa', 'query', 'action', 'workflow') NULL,
    `current_node` VARCHAR(256) NULL,
    `input` JSON NULL,
    `output` JSON NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `max_retries` INTEGER NOT NULL DEFAULT 3,
    `timeout_ms` INTEGER NOT NULL DEFAULT 300000,
    `fail_reason` TEXT NULL,
    `job_id` VARCHAR(128) NULL,
    `scheduled_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_tenant_id_idx`(`tenant_id`),
    INDEX `task_session_id_idx`(`session_id`),
    INDEX `task_user_id_idx`(`user_id`),
    INDEX `task_status_idx`(`status`),
    INDEX `task_type_idx`(`type`),
    INDEX `task_capability_type_idx`(`capability_type`),
    INDEX `task_tenant_id_status_idx`(`tenant_id`, `status`),
    INDEX `task_tenant_id_type_status_idx`(`tenant_id`, `type`, `status`),
    INDEX `task_job_id_idx`(`job_id`),
    INDEX `task_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_step` (
    `id` CHAR(36) NOT NULL,
    `task_id` CHAR(36) NOT NULL,
    `seq` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(256) NOT NULL,
    `description` VARCHAR(512) NULL,
    `status` ENUM('pending', 'running', 'completed', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
    `input` JSON NULL,
    `output` JSON NULL,
    `tool_name` VARCHAR(128) NULL,
    `fail_reason` TEXT NULL,
    `duration_ms` INTEGER NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_step_task_id_idx`(`task_id`),
    INDEX `task_step_task_id_seq_idx`(`task_id`, `seq`),
    INDEX `task_step_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_log` (
    `id` CHAR(36) NOT NULL,
    `task_id` CHAR(36) NOT NULL,
    `step_id` CHAR(36) NULL,
    `type` ENUM('state_change', 'tool_call', 'error', 'confirmation', 'notification', 'retry', 'custom') NOT NULL,
    `level` ENUM('info', 'warn', 'error') NOT NULL DEFAULT 'info',
    `message` TEXT NOT NULL,
    `detail` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_log_task_id_idx`(`task_id`),
    INDEX `task_log_task_id_type_idx`(`task_id`, `type`),
    INDEX `task_log_step_id_idx`(`step_id`),
    INDEX `task_log_level_idx`(`level`),
    INDEX `task_log_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_step` ADD CONSTRAINT `task_step_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_log` ADD CONSTRAINT `task_log_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
