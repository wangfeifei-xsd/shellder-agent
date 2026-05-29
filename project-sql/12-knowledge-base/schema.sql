-- ================================================================
-- 阶段 11A — 知识库代理与知识库管理（功能清单 §1.7 / 架构 Knowledge）
-- 依赖：01-bootstrap, 02-tenant-management, 06-connector-management
-- ================================================================

-- 知识库主表
CREATE TABLE IF NOT EXISTS `knowledge_base` (
  `id`                CHAR(36)     NOT NULL,
  `tenant_id`         CHAR(36)     NOT NULL,
  `name`              VARCHAR(128) NOT NULL,
  `description`       VARCHAR(512) DEFAULT NULL,
  `embedding_model`   VARCHAR(128) NOT NULL DEFAULT 'text-embedding-3-small',
  `similarity_metric` VARCHAR(32)  NOT NULL DEFAULT 'cosine',
  `chunk_strategy`    VARCHAR(32)  NOT NULL DEFAULT 'fixed_size',
  `chunk_size`        INT          NOT NULL DEFAULT 500,
  `chunk_overlap`     INT          NOT NULL DEFAULT 50,
  `status`            ENUM('active','disabled','deleted') NOT NULL DEFAULT 'active',
  `document_count`    INT          NOT NULL DEFAULT 0,
  `chunk_count`       INT          NOT NULL DEFAULT 0,
  `created_by`        CHAR(36)     DEFAULT NULL,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL,
  `deleted_at`        DATETIME(3)  DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `kb_tenant_name_key` (`tenant_id`, `name`),
  INDEX `idx_kb_tenant_id` (`tenant_id`),
  INDEX `idx_kb_status` (`status`),
  INDEX `idx_kb_tenant_status` (`tenant_id`, `status`),
  INDEX `idx_kb_created_at` (`created_at`),
  CONSTRAINT `fk_kb_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 知识库数据源
CREATE TABLE IF NOT EXISTS `kb_data_source` (
  `id`                CHAR(36)     NOT NULL,
  `knowledge_base_id` CHAR(36)     NOT NULL,
  `tenant_id`         CHAR(36)     NOT NULL,
  `name`              VARCHAR(128) NOT NULL,
  `type`              ENUM('file','url','api','connector') NOT NULL DEFAULT 'file',
  `config`            JSON         DEFAULT NULL,
  `sync_cron`         VARCHAR(64)  DEFAULT NULL,
  `last_sync_at`      DATETIME(3)  DEFAULT NULL,
  `status`            ENUM('active','disabled','error') NOT NULL DEFAULT 'active',
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_kbds_kb_id` (`knowledge_base_id`),
  INDEX `idx_kbds_tenant_id` (`tenant_id`),
  INDEX `idx_kbds_type` (`type`),
  INDEX `idx_kbds_status` (`status`),
  CONSTRAINT `fk_kbds_kb` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kbds_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 知识库文档
CREATE TABLE IF NOT EXISTS `kb_document` (
  `id`                CHAR(36)      NOT NULL,
  `data_source_id`    CHAR(36)      DEFAULT NULL,
  `knowledge_base_id` CHAR(36)      NOT NULL,
  `tenant_id`         CHAR(36)      NOT NULL,
  `title`             VARCHAR(256)  NOT NULL,
  `file_key`          VARCHAR(512)  DEFAULT NULL,
  `file_size`         INT           DEFAULT NULL,
  `mime_type`         VARCHAR(128)  DEFAULT NULL,
  `content_hash`      VARCHAR(64)   DEFAULT NULL,
  `char_count`        INT           DEFAULT 0,
  `chunk_count`       INT           DEFAULT 0,
  `status`            ENUM('pending','chunking','embedding','ready','error') NOT NULL DEFAULT 'pending',
  `error_msg`         VARCHAR(1024) DEFAULT NULL,
  `created_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)   NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_kbdoc_kb_id` (`knowledge_base_id`),
  INDEX `idx_kbdoc_ds_id` (`data_source_id`),
  INDEX `idx_kbdoc_tenant_id` (`tenant_id`),
  INDEX `idx_kbdoc_status` (`status`),
  INDEX `idx_kbdoc_created_at` (`created_at`),
  CONSTRAINT `fk_kbdoc_kb` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kbdoc_ds` FOREIGN KEY (`data_source_id`) REFERENCES `kb_data_source` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_kbdoc_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 知识库文档分块
CREATE TABLE IF NOT EXISTS `kb_chunk` (
  `id`                CHAR(36)     NOT NULL,
  `document_id`       CHAR(36)     NOT NULL,
  `knowledge_base_id` CHAR(36)     NOT NULL,
  `tenant_id`         CHAR(36)     NOT NULL,
  `content`           TEXT         NOT NULL,
  `token_count`       INT          DEFAULT 0,
  `chunk_index`       INT          NOT NULL DEFAULT 0,
  `metadata`          JSON         DEFAULT NULL,
  `embedding`         JSON         DEFAULT NULL,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_kbc_doc_id` (`document_id`),
  INDEX `idx_kbc_kb_id` (`knowledge_base_id`),
  INDEX `idx_kbc_tenant_id` (`tenant_id`),
  INDEX `idx_kbc_chunk_index` (`document_id`, `chunk_index`),
  CONSTRAINT `fk_kbc_doc` FOREIGN KEY (`document_id`) REFERENCES `kb_document` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kbc_kb` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kbc_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 向量化任务
CREATE TABLE IF NOT EXISTS `kb_embedding_task` (
  `id`                CHAR(36)      NOT NULL,
  `knowledge_base_id` CHAR(36)      NOT NULL,
  `tenant_id`         CHAR(36)      NOT NULL,
  `document_id`       CHAR(36)      DEFAULT NULL,
  `status`            ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  `total_chunks`      INT           NOT NULL DEFAULT 0,
  `processed_chunks`  INT           NOT NULL DEFAULT 0,
  `error_msg`         VARCHAR(1024) DEFAULT NULL,
  `started_at`        DATETIME(3)   DEFAULT NULL,
  `finished_at`       DATETIME(3)   DEFAULT NULL,
  `created_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_kbet_kb_id` (`knowledge_base_id`),
  INDEX `idx_kbet_tenant_id` (`tenant_id`),
  INDEX `idx_kbet_doc_id` (`document_id`),
  INDEX `idx_kbet_status` (`status`),
  INDEX `idx_kbet_created_at` (`created_at`),
  CONSTRAINT `fk_kbet_kb` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kbet_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_kbet_doc` FOREIGN KEY (`document_id`) REFERENCES `kb_document` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
