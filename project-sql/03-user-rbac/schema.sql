-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 03 — 用户与权限（RBAC）
-- 依赖：02-tenant-management（user_tenant.tenant_id 外键引用 tenant.id）
-- 作用：新增平台独立账号体系（user）、角色（role）、用户-角色（user_role）、
--      用户-租户（user_tenant，多租户绑定），支撑 JWT 登录与 RBAC（功能清单 §1.10）。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529010000_user_rbac/migration.sql

-- CreateTable
CREATE TABLE `agent_platform`.`user` (
    `id`            CHAR(36)     NOT NULL COMMENT '用户主键',
    `username`      VARCHAR(64)  NOT NULL COMMENT '登录用户名，平台内唯一',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'bcrypt 口令哈希',
    `display_name`  VARCHAR(128) NULL COMMENT '显示名',
    `email`         VARCHAR(128) NULL COMMENT '邮箱（可选）',
    `status`        ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/禁用；禁用后无法登录',
    `is_system`     BOOLEAN      NOT NULL DEFAULT false COMMENT '系统内置账号（不可删除）',
    `remark`        VARCHAR(512) NULL COMMENT '备注',
    `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`    DATETIME(3)  NOT NULL COMMENT '更新时间',

    UNIQUE INDEX `user_username_key` (`username`),
    INDEX `user_status_idx` (`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='平台用户账号';

-- CreateTable
CREATE TABLE `agent_platform`.`role` (
    `id`          CHAR(36)     NOT NULL COMMENT '角色主键',
    `code`        VARCHAR(64)  NOT NULL COMMENT '角色编码，平台内唯一',
    `name`        VARCHAR(128) NOT NULL COMMENT '角色名称',
    `description` VARCHAR(512) NULL COMMENT '角色描述',
    `menus`       JSON         NULL COMMENT '菜单权限 key 列表；["*"] 表示全部',
    `modules`     JSON         NULL COMMENT '模块（写）权限 key 列表',
    `tool_scopes` JSON         NULL COMMENT 'Tool 权限范围 key 列表；["*"] 表示全部',
    `policy`      JSON         NULL COMMENT '能力访问与高风险审批策略，见模块 README',
    `is_system`   BOOLEAN      NOT NULL DEFAULT false COMMENT '系统内置角色（不可删除）',
    `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`  DATETIME(3)  NOT NULL COMMENT '更新时间',

    UNIQUE INDEX `role_code_key` (`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='RBAC 角色';

-- CreateTable：用户-角色 多对多
CREATE TABLE `agent_platform`.`user_role` (
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,

    INDEX `user_role_role_id_idx` (`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='用户与角色关联';

-- CreateTable：用户-租户 多对多（支持多租户绑定，tenant_id → tenant.id）
CREATE TABLE `agent_platform`.`user_tenant` (
    `user_id`   CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,

    INDEX `user_tenant_tenant_id_idx` (`tenant_id`),
    PRIMARY KEY (`user_id`, `tenant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='用户与租户绑定';

-- AddForeignKey
ALTER TABLE `agent_platform`.`user_role` ADD CONSTRAINT `user_role_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `agent_platform`.`user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_role` ADD CONSTRAINT `user_role_role_id_fkey`
    FOREIGN KEY (`role_id`) REFERENCES `agent_platform`.`role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_tenant` ADD CONSTRAINT `user_tenant_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `agent_platform`.`user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_tenant` ADD CONSTRAINT `user_tenant_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- role.policy JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "capabilities": ["qa", "query", "action", "workflow"],   -- 四类能力访问权限
--   "canApproveHighRisk": true                                -- 高风险动作审批权限
-- }