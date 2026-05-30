-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 11A — 知识库代理与知识库管理（功能清单 §1.7 / 架构 Knowledge）
-- 依赖：01-bootstrap, 02-tenant-management
-- V1 仅保留 knowledge_base 租户绑定元数据；内容/召回由 pathy-knowledge-server 承担。
-- 自建子表 kb_data_source / kb_document / kb_chunk / kb_embedding_task 已废弃，不在本 SQL 交付。
-- ================================================================

-- 知识库主表（租户 pathy wiki 路径绑定）
CREATE TABLE IF NOT EXISTS `agent_platform`.`knowledge_base` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库租户绑定（pathy 代理）';