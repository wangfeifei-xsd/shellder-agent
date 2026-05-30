-- CreateTable
CREATE TABLE `kb_layer_processing_job` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `layer` VARCHAR(32) NOT NULL,
    `input_path` VARCHAR(512) NOT NULL,
    `output_path` VARCHAR(512) NULL,
    `operation` VARCHAR(32) NOT NULL DEFAULT 'compile_and_embed',
    `status` ENUM('queued', 'running', 'done', 'failed') NOT NULL DEFAULT 'queued',
    `idempotency_key` VARCHAR(256) NOT NULL,
    `bull_job_id` VARCHAR(64) NULL,
    `error_msg` VARCHAR(1024) NULL,
    `result` JSON NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kb_layer_processing_job_idempotency_key_key`(`idempotency_key`),
    INDEX `kb_layer_processing_job_tenant_id_idx`(`tenant_id`),
    INDEX `kb_layer_processing_job_status_idx`(`status`),
    INDEX `kb_layer_processing_job_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `kb_layer_processing_job` ADD CONSTRAINT `kb_layer_processing_job_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
