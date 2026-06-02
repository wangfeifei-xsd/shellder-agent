-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 06b — 只读库连接器元数据（表结构抽取 + ER 关系图）
-- 依赖：06-connector-management（connector_db_metadata.connector_id → connector.id ON DELETE CASCADE）
-- 作用：存储 information_schema 抽取结果与 ER 关系图草稿/发布版，供查询型 NL2SQL 与 Runtime 使用。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260601000000_connector_db_metadata/migration.sql

CREATE TABLE `agent_platform`.`connector_db_metadata` (
    `connector_id`          CHAR(36)     NOT NULL COMMENT '主键，→ connector.id',
    `introspected_schema`   JSON         NULL COMMENT '最近一次原始表结构抽取 JSON',
    `introspected_at`       DATETIME(3)  NULL COMMENT '抽取完成时间',
    `er_diagram_draft`      JSON         NULL COMMENT 'ER 关系图草稿 JSON（§4.3）',
    `er_diagram_published`  JSON         NULL COMMENT '已发布 ER 关系图；Runtime/NL2SQL 仅读此字段',
    `er_published_version`  INTEGER      NULL COMMENT '已发布版本号（单调递增）',
    `er_published_at`       DATETIME(3)  NULL COMMENT '最近发布时间',

    PRIMARY KEY (`connector_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='只读库连接器元数据（结构抽取与 ER 图）';

ALTER TABLE `agent_platform`.`connector_db_metadata` ADD CONSTRAINT `connector_db_metadata_connector_id_fkey`
    FOREIGN KEY (`connector_id`) REFERENCES `agent_platform`.`connector`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
