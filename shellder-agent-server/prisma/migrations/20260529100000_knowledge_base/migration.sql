-- 阶段 12 — 知识库代理与知识库管理
-- CreateTable
CREATE TABLE `knowledge_base` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `embedding_model` VARCHAR(128) NOT NULL DEFAULT 'text-embedding-3-small',
    `similarity_metric` VARCHAR(32) NOT NULL DEFAULT 'cosine',
    `chunk_strategy` VARCHAR(32) NOT NULL DEFAULT 'fixed_size',
    `chunk_size` INTEGER NOT NULL DEFAULT 500,
    `chunk_overlap` INTEGER NOT NULL DEFAULT 50,
    `status` ENUM('active', 'disabled', 'deleted') NOT NULL DEFAULT 'active',
    `document_count` INTEGER NOT NULL DEFAULT 0,
    `chunk_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `knowledge_base_tenant_id_idx`(`tenant_id`),
    INDEX `knowledge_base_status_idx`(`status`),
    INDEX `knowledge_base_tenant_id_status_idx`(`tenant_id`, `status`),
    INDEX `knowledge_base_created_at_idx`(`created_at`),
    UNIQUE INDEX `knowledge_base_tenant_id_name_key`(`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kb_data_source` (
    `id` CHAR(36) NOT NULL,
    `knowledge_base_id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `type` ENUM('file', 'url', 'api', 'connector') NOT NULL DEFAULT 'file',
    `config` JSON NULL,
    `sync_cron` VARCHAR(64) NULL,
    `last_sync_at` DATETIME(3) NULL,
    `status` ENUM('active', 'disabled', 'error') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `kb_data_source_knowledge_base_id_idx`(`knowledge_base_id`),
    INDEX `kb_data_source_tenant_id_idx`(`tenant_id`),
    INDEX `kb_data_source_type_idx`(`type`),
    INDEX `kb_data_source_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kb_document` (
    `id` CHAR(36) NOT NULL,
    `data_source_id` CHAR(36) NULL,
    `knowledge_base_id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `title` VARCHAR(256) NOT NULL,
    `file_key` VARCHAR(512) NULL,
    `file_size` INTEGER NULL,
    `mime_type` VARCHAR(128) NULL,
    `content_hash` VARCHAR(64) NULL,
    `char_count` INTEGER NOT NULL DEFAULT 0,
    `chunk_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('pending', 'chunking', 'embedding', 'ready', 'error') NOT NULL DEFAULT 'pending',
    `error_msg` VARCHAR(1024) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `kb_document_knowledge_base_id_idx`(`knowledge_base_id`),
    INDEX `kb_document_data_source_id_idx`(`data_source_id`),
    INDEX `kb_document_tenant_id_idx`(`tenant_id`),
    INDEX `kb_document_status_idx`(`status`),
    INDEX `kb_document_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kb_chunk` (
    `id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `knowledge_base_id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `content` TEXT NOT NULL,
    `token_count` INTEGER NOT NULL DEFAULT 0,
    `chunk_index` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `embedding` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `kb_chunk_document_id_idx`(`document_id`),
    INDEX `kb_chunk_knowledge_base_id_idx`(`knowledge_base_id`),
    INDEX `kb_chunk_tenant_id_idx`(`tenant_id`),
    INDEX `kb_chunk_document_id_chunk_index_idx`(`document_id`, `chunk_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kb_embedding_task` (
    `id` CHAR(36) NOT NULL,
    `knowledge_base_id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NULL,
    `status` ENUM('queued', 'running', 'done', 'failed') NOT NULL DEFAULT 'queued',
    `total_chunks` INTEGER NOT NULL DEFAULT 0,
    `processed_chunks` INTEGER NOT NULL DEFAULT 0,
    `error_msg` VARCHAR(1024) NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `kb_embedding_task_knowledge_base_id_idx`(`knowledge_base_id`),
    INDEX `kb_embedding_task_tenant_id_idx`(`tenant_id`),
    INDEX `kb_embedding_task_document_id_idx`(`document_id`),
    INDEX `kb_embedding_task_status_idx`(`status`),
    INDEX `kb_embedding_task_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `knowledge_base` ADD CONSTRAINT `knowledge_base_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_data_source` ADD CONSTRAINT `kb_data_source_knowledge_base_id_fkey` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_data_source` ADD CONSTRAINT `kb_data_source_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_document` ADD CONSTRAINT `kb_document_knowledge_base_id_fkey` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_document` ADD CONSTRAINT `kb_document_data_source_id_fkey` FOREIGN KEY (`data_source_id`) REFERENCES `kb_data_source`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_document` ADD CONSTRAINT `kb_document_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_chunk` ADD CONSTRAINT `kb_chunk_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `kb_document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_chunk` ADD CONSTRAINT `kb_chunk_knowledge_base_id_fkey` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_chunk` ADD CONSTRAINT `kb_chunk_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_embedding_task` ADD CONSTRAINT `kb_embedding_task_knowledge_base_id_fkey` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_embedding_task` ADD CONSTRAINT `kb_embedding_task_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kb_embedding_task` ADD CONSTRAINT `kb_embedding_task_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `kb_document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
