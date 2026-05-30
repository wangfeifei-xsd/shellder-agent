-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 02 — 租户管理
-- 依赖：01-bootstrap（仅迁移流水线，无业务表）
-- 作用：新增 tenant 表，作为各业务表 tenant_id 外键的归属主数据（实施规格 §1.3）。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529000000_tenant_management/migration.sql

-- CreateTable
CREATE TABLE `agent_platform`.`tenant` (
    `id`                 CHAR(36)     NOT NULL COMMENT 'Agent 库主键；业务表 tenant_id 外键',
    `code`               VARCHAR(64)  NOT NULL COMMENT '租户编码，平台内唯一',
    `name`               VARCHAR(128) NOT NULL COMMENT '租户名称',
    `status`             ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/禁用',
    `external_tenant_id` VARCHAR(128) NULL COMMENT '可选；上层业务租户标识，手工维护，非同步字段',
    `config`             JSON         NULL COMMENT '开通能力 capabilities、默认限额 limits、隔离策略 isolation 等',
    `admin_user_id`      CHAR(36)     NULL COMMENT '可选；租户管理员（平台用户，用户模块未就绪前可空）',
    `remark`             VARCHAR(512) NULL COMMENT '备注',
    `created_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`         DATETIME(3)  NOT NULL COMMENT '更新时间',

    UNIQUE INDEX `tenant_code_key` (`code`),
    INDEX `tenant_status_idx` (`status`),
    INDEX `tenant_external_tenant_id_idx` (`external_tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='租户主数据';

-- config JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "capabilities": ["qa", "query", "action", "workflow"],   -- 开通能力：问答型/查询型/操作型/流程型
--   "limits": { "maxSessions": 0, "maxTasks": 0 },             -- 默认限额，0 表示不限制
--   "isolation": {
--     "dataIsolationStrategy": "strict",                       -- strict 严格隔离 / shared 共享
--     "restrictCrossTenant": true,                             -- 限制跨租户访问
--     "connectorVisibleWithinTenant": true,                    -- 连接器仅租户内可见
--     "toolVisibleWithinTenant": true,                         -- 工具仅租户内可见
--     "auditVisibleWithinTenant": true                         -- 审计数据仅租户内可见
--   }
-- }