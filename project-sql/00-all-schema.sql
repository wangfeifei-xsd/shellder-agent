-- =============================================================================
-- shellder-agent 全量建表脚本（由 project-sql 各模块自动合并）
-- 生成：./merge-all-sql.sh
-- 目标库：agent_platform（见 db-name.cnf）
-- 顺序：模块 01 → 20；12 含 schema.sql + schema-pathy-binding.sql
-- 用法：mysql -h HOST -u USER -p < 00-all-schema.sql
--       或 mysql -h HOST -u USER -p agent_platform < 00-all-schema.sql
-- 注意：若已用 Prisma migrate，请勿重复执行与本库冲突的 DDL
-- =============================================================================
-- 目标库: agent_platform
USE `agent_platform`;

-- -----------------------------------------------------------------------------
-- 来源: 01-bootstrap/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 01 — 工程脚手架与基础设施
-- 本阶段无业务表；仅通过 Prisma 初始化 _prisma_migrations 迁移历史。
-- 业务表从模块 02（tenant）起按 project-sql 递增交付。

-- -----------------------------------------------------------------------------
-- 来源: 02-tenant-management/schema.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 来源: 03-user-rbac/schema.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 来源: 04-audit-center/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 04 — 审计模块与审计中心
-- 依赖：02-tenant-management（tenant_id → tenant.id）、03-user-rbac（操作人 / 调用人取自 user）
-- 作用：新增三类审计采集通道表（工具调用 / 用户操作 / 外部接口）；
--      风险动作审计为聚合只读视图，不单独建表（执行计划 §3.4 / §5.2）。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529020000_audit_center/migration.sql
--
-- 设计要点：
-- 1. 所有写操作必须审计（架构 §8），用户操作审计由 AuditInterceptor + @Audit 装饰器自动采集。
-- 2. 所有外部系统调用必须记录（external_call_audit），06 连接器 / 13 业务能力起写入。
-- 3. tool_call_audit 表结构就绪，07 工具模块起写入真实数据。
-- 4. 审计为保留性数据，tenant_id 外键 ON DELETE RESTRICT；平台内租户只禁用不删除。
-- 5. 审计日志均建 created_at 索引以支撑时间范围查询（架构 §7）。

-- CreateTable：工具调用审计
CREATE TABLE `agent_platform`.`tool_call_audit` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`       CHAR(36)     NULL COMMENT '所属租户，→ tenant.id；平台级调用可空',
    `tool_id`         CHAR(36)     NULL COMMENT 'Tool 主键（07 工具注册）占位，暂不加外键',
    `tool_name`       VARCHAR(128) NOT NULL COMMENT 'Tool 名称',
    `caller_user_id`  VARCHAR(256) NULL COMMENT '调用人：管理端 user.id；Copilot 为 JWT sub',
    `caller_name`     VARCHAR(128) NULL COMMENT '调用人显示名快照',
    `session_id`      CHAR(36)     NULL COMMENT '会话 ID（08）占位，用于风险动作链路聚合',
    `task_id`         CHAR(36)     NULL COMMENT '任务 ID（09）占位',
    `request_summary` TEXT         NULL COMMENT '入参摘要（脱敏文本，非完整原始入参）',
    `status`          ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'pending' COMMENT '调用结果状态',
    `error_message`   VARCHAR(1024) NULL COMMENT '失败原因',
    `duration_ms`     INTEGER      NULL COMMENT '耗时（毫秒）',
    `high_risk`       BOOLEAN      NOT NULL DEFAULT false COMMENT '高风险标记，供风险动作审计聚合',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',

    INDEX `tool_call_audit_tenant_id_idx` (`tenant_id`),
    INDEX `tool_call_audit_tool_name_idx` (`tool_name`),
    INDEX `tool_call_audit_caller_user_id_idx` (`caller_user_id`),
    INDEX `tool_call_audit_status_idx` (`status`),
    INDEX `tool_call_audit_high_risk_idx` (`high_risk`),
    INDEX `tool_call_audit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='工具调用审计';

-- CreateTable：用户操作审计
CREATE TABLE `agent_platform`.`user_action_audit` (
    `id`               CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`        CHAR(36)     NULL COMMENT '操作所属租户上下文（取顶栏当前操作租户）',
    `operator_user_id` CHAR(36)     NULL COMMENT '操作人 user.id',
    `operator_name`    VARCHAR(128) NULL COMMENT '操作人用户名快照',
    `action`           VARCHAR(128) NOT NULL COMMENT '操作标识，如 user.update / role.create',
    `module`           VARCHAR(64)  NULL COMMENT '模块权限 key，如 user.manage',
    `target_type`      VARCHAR(64)  NULL COMMENT '目标资源类型，如 user / role / tenant',
    `target_id`        VARCHAR(64)  NULL COMMENT '目标资源 ID',
    `summary`          VARCHAR(512) NULL COMMENT '操作摘要',
    `diff`             JSON         NULL COMMENT '操作前后差异摘要 { before?, after?, params?, body? }',
    `status`           ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'success' COMMENT '操作结果',
    `ip`               VARCHAR(64)  NULL COMMENT '来源 IP',
    `request_id`       VARCHAR(64)  NULL COMMENT '请求链路 ID（x-request-id）',
    `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',

    INDEX `user_action_audit_tenant_id_idx` (`tenant_id`),
    INDEX `user_action_audit_operator_user_id_idx` (`operator_user_id`),
    INDEX `user_action_audit_action_idx` (`action`),
    INDEX `user_action_audit_module_idx` (`module`),
    INDEX `user_action_audit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='用户操作审计';

-- CreateTable：外部接口审计
CREATE TABLE `agent_platform`.`external_call_audit` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`       CHAR(36)     NULL COMMENT '所属租户，→ tenant.id',
    `connector_id`    CHAR(36)     NULL COMMENT '连接器主键（06）占位',
    `target`          VARCHAR(255) NOT NULL COMMENT '外部目标系统标识 / URL',
    `method`          VARCHAR(16)  NULL COMMENT '调用方法，如 HTTP 方法',
    `caller_user_id`  VARCHAR(256) NULL COMMENT '触发调用方：管理端 user.id；Copilot 为 JWT sub',
    `session_id`      CHAR(36)     NULL COMMENT '会话 ID（08）占位',
    `task_id`         CHAR(36)     NULL COMMENT '任务 ID（09）占位',
    `request_summary` TEXT         NULL COMMENT '请求摘要（脱敏）',
    `status`          ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'success' COMMENT '调用结果状态',
    `status_code`     INTEGER      NULL COMMENT '外部返回状态码（如 HTTP 状态码）',
    `duration_ms`     INTEGER      NULL COMMENT '耗时（毫秒）',
    `error_message`   VARCHAR(1024) NULL COMMENT '失败原因',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',

    INDEX `external_call_audit_tenant_id_idx` (`tenant_id`),
    INDEX `external_call_audit_target_idx` (`target`),
    INDEX `external_call_audit_status_idx` (`status`),
    INDEX `external_call_audit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='外部接口调用审计';

-- AddForeignKey
ALTER TABLE `agent_platform`.`tool_call_audit` ADD CONSTRAINT `tool_call_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`user_action_audit` ADD CONSTRAINT `user_action_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`external_call_audit` ADD CONSTRAINT `external_call_audit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 风险动作审计：聚合只读视图，不建独立采集表。
-- V1 数据源 = tool_call_audit(high_risk = true)；14-审批中心 就绪后再 JOIN approval。
-- 参考应用层聚合（按 session_id / task_id 串联全链路）：
--   SELECT * FROM tool_call_audit WHERE high_risk = true ORDER BY created_at DESC;

-- -----------------------------------------------------------------------------
-- 来源: 05-policy-engine/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 05 — 策略引擎与规则配置
-- 依赖：02-tenant-management（rule.tenant_id / rule_hit.tenant_id → tenant.id）、
--      03-user-rbac（knowledge 菜单权限、rule.manage 模块权限；命中留痕 caller_user_id 取自 user）、
--      04-audit-center（写操作经 @Audit 落 user_action_audit）。
-- 作用：新增显式规则配置表（rule）与规则命中记录表（rule_hit），支撑 Policy 模块
--      （权限判断 / 风险等级 / 确认拦截，架构 §4.2）及功能清单 §1.7 规则部分。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529030000_policy_engine/migration.sql
--
-- 设计要点：
-- 1. 规则按租户隔离（实施规格 §1.4）：rule.tenant_id 必须来自 tenant 表，非空。
-- 2. priority 数值越小优先级越高；Policy 按 (priority ASC, created_at) 评估。
-- 3. conditions 为匹配条件 DSL（JSON），空对象 {} 表示租户内全量匹配；结构见 README。
-- 4. rule_hit 为命中留痕（审计性质）：rule 删除时 rule_id 置空（ON DELETE SET NULL），
--    并保留 rule_name / rule_type / rule_action 快照，确保命中历史不丢失（验收标准 2）。
-- 5. tenant_id 外键 ON DELETE RESTRICT，与审计一致；平台内租户只禁用不删除。
-- 6. 不包含 SQL 表白名单、行数限制等（属 SQL 查询工具配置，执行计划 §8 / §4.2「不包含」）。

-- CreateTable：显式规则配置（按租户）
CREATE TABLE `agent_platform`.`rule` (
    `id`          CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`   CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `name`        VARCHAR(128) NOT NULL COMMENT '规则名称',
    `type`        ENUM('high_risk', 'confirm', 'capability_limit', 'custom') NOT NULL
                  COMMENT '规则类型：高风险识别/确认拦截/能力级限制/通用',
    `conditions`  JSON         NOT NULL COMMENT '匹配条件 DSL（JSON），{} 表示租户内全量匹配',
    `action`      ENUM('allow', 'deny', 'need_confirm', 'mark_high_risk') NOT NULL
                  COMMENT '命中处置：放行/拦截/需确认/标记高风险',
    `priority`    INTEGER      NOT NULL DEFAULT 100 COMMENT '优先级，数值越小越优先',
    `status`      ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
    `description` VARCHAR(512) NULL COMMENT '规则说明',
    `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`  DATETIME(3)  NOT NULL COMMENT '更新时间',

    INDEX `rule_tenant_id_idx` (`tenant_id`),
    INDEX `rule_type_idx` (`type`),
    INDEX `rule_status_idx` (`status`),
    INDEX `rule_tenant_id_status_priority_idx` (`tenant_id`, `status`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='策略规则配置';

-- CreateTable：规则命中记录
CREATE TABLE `agent_platform`.`rule_hit` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `rule_id`         CHAR(36)     NULL COMMENT '命中规则 → rule.id；规则删除后置空，保留快照',
    `tenant_id`       CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `rule_name`       VARCHAR(128) NOT NULL COMMENT '命中时规则名称快照',
    `rule_type`       ENUM('high_risk', 'confirm', 'capability_limit', 'custom') NOT NULL COMMENT '命中时规则类型快照',
    `rule_action`     ENUM('allow', 'deny', 'need_confirm', 'mark_high_risk') NOT NULL COMMENT '命中时规则动作快照',
    `result`          VARCHAR(32)  NOT NULL COMMENT '本次请求最终处置：allow/deny/need_confirm',
    `tool_name`       VARCHAR(128) NULL COMMENT '触发请求的 Tool 名称（07 起）',
    `capability`      VARCHAR(32)  NULL COMMENT '业务能力：qa/query/action/workflow',
    `request_summary` TEXT         NULL COMMENT '请求内容摘要（脱敏）',
    `caller_user_id`  VARCHAR(256) NULL COMMENT '触发方：管理端 user.id；Copilot 为 JWT sub',
    `session_id`      CHAR(36)     NULL COMMENT '会话 ID（08）占位',
    `task_id`         CHAR(36)     NULL COMMENT '任务 ID（09）占位',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '命中时间',

    INDEX `rule_hit_rule_id_idx` (`rule_id`),
    INDEX `rule_hit_tenant_id_idx` (`tenant_id`),
    INDEX `rule_hit_session_id_idx` (`session_id`),
    INDEX `rule_hit_task_id_idx` (`task_id`),
    INDEX `rule_hit_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='策略规则命中记录';

-- AddForeignKey
ALTER TABLE `agent_platform`.`rule` ADD CONSTRAINT `rule_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`rule_hit` ADD CONSTRAINT `rule_hit_rule_id_fkey`
    FOREIGN KEY (`rule_id`) REFERENCES `agent_platform`.`rule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`rule_hit` ADD CONSTRAINT `rule_hit_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- conditions JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "match": "all" | "any",                       -- 子句匹配模式，默认 all
--   "toolNames": ["createOrder", "deleteUser"],   -- 命中 Tool 名称（精确）
--   "toolNameContains": "delete",                 -- Tool 名称包含匹配（忽略大小写）
--   "riskLevels": ["high"],                        -- 命中风险等级 low/medium/high
--   "capabilities": ["action", "workflow"],        -- 命中业务能力
--   "needConfirmation": true,                       -- 命中 Tool 自身 needConfirmation 标记
--   "permissionScopes": ["order:write"]            -- 命中 Tool 权限范围
-- }

-- -----------------------------------------------------------------------------
-- 来源: 06-connector-management/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 06 — 连接器管理
-- 依赖：02-tenant-management（connector.tenant_id → tenant.id）、
--      03-user-rbac（connector 菜单权限、connector.manage 模块权限）、
--      04-audit-center（连通性测试 / 外部调用记入 external_call_audit；写操作经 @Audit 落 user_action_audit）。
-- 作用：新增连接器配置表（connector），支撑外部连接器配置、连通性测试及管理后台菜单
--      （功能清单 §1.6 / 架构 §4.4 Connector Management），为 07 Query/Action/Notification Tool 提供连接能力。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529040000_connector_management/migration.sql
--
-- 设计要点：
-- 1. 连接器按租户隔离（实施规格 §1.4）：connector.tenant_id 必须来自 tenant 表，非空。
-- 2. 三类连接器（功能清单 §1.6）：
--    - db_readonly  只读数据库：查询型能力 / SQL Query Tool（查询型仅经只读 DB，不经 HTTP 查数，架构 §4.4）。
--    - http         HTTP API：操作型 Action Tool、流程型外部步骤（不用于查询型数据查询）。
--    - notification 消息通知接口：Notification Tool、流程型通知步骤。
-- 3. 凭证不落明文：敏感字段（口令 / 令牌 / 密钥）经 AES-256-GCM 加密后存于 config.secretCipher；
--    config 同时保存非敏感的 properties 与可被引用的 allowedToolScopes（结构见 README）。
-- 4. tenant_id 外键 ON DELETE RESTRICT，与审计 / 规则一致；平台内租户只禁用不删除。
-- 5. 禁用租户不可新建连接器（验收标准 3，应用层在 create 时校验 tenant.status）。
-- 6. 连通性测试结果记入 04 external_call_audit（connector_id 关联，无外键以保持审计独立、不阻断连接器删除）；
--    最近一次测试快照冗余存于 last_test_* 字段，供列表 / 详情直接展示。

-- CreateTable：外部连接器配置（按租户）
CREATE TABLE `agent_platform`.`connector` (
    `id`                   CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`            CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `name`                 VARCHAR(128) NOT NULL COMMENT '连接器名称',
    `type`                 ENUM('db_readonly', 'http', 'notification') NOT NULL
                           COMMENT '类型：只读数据库 / HTTP API / 消息通知接口',
    `target`               VARCHAR(512) NOT NULL COMMENT '目标系统地址（http/notification 为 URL；db_readonly 为 host:port）',
    `auth_type`            VARCHAR(32)  NOT NULL DEFAULT 'none' COMMENT '认证方式：none/basic/bearer/api_key/custom',
    `timeout_ms`           INTEGER      NOT NULL DEFAULT 5000 COMMENT '调用 / 测试超时（毫秒）',
    `status`               ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用 / 停用',
    `config`               JSON         NOT NULL COMMENT '非敏感配置(properties)+可引用Tool范围(allowedToolScopes)+加密凭证(secretCipher)',
    `description`          VARCHAR(512) NULL COMMENT '连接器说明',
    `last_test_status`     ENUM('success', 'failed') NULL COMMENT '最近一次连通性测试结果',
    `last_test_latency_ms` INTEGER      NULL COMMENT '最近一次测试响应耗时（毫秒）',
    `last_test_message`    VARCHAR(512) NULL COMMENT '最近一次测试结果说明',
    `last_tested_at`       DATETIME(3)  NULL COMMENT '最近一次测试时间',
    `created_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`           DATETIME(3)  NOT NULL COMMENT '更新时间',

    INDEX `connector_tenant_id_idx` (`tenant_id`),
    INDEX `connector_type_idx` (`type`),
    INDEX `connector_status_idx` (`status`),
    INDEX `connector_tenant_id_type_status_idx` (`tenant_id`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='外部连接器配置';

-- AddForeignKey
ALTER TABLE `agent_platform`.`connector` ADD CONSTRAINT `connector_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- config JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "properties": {                  -- 非敏感的类型相关配置
--     "database": "report",          --   db_readonly：库名 / 用户名 / sslMode 等
--     "username": "readonly",
--     "baseHeaders": { "X-App": "a" } --   http/notification：固定请求头等
--   },
--   "allowedToolScopes": ["order:read"], -- 可被哪些 Tool 引用（07 工具按此校验绑定）
--   "secretCipher": "v1:<base64>"        -- AES-256-GCM 加密后的凭证 JSON（口令/令牌/密钥）；无凭证为 null
-- }
--
-- 加密凭证明文结构（加密前，按 auth_type 不同）：
--   basic   → { "username": "...", "password": "..." }
--   bearer  → { "token": "..." }
--   api_key → { "headerName": "X-API-Key", "apiKey": "..." }
--   custom  → { "header.X-Xxx": "..." }
-- 备注：external_call_audit.connector_id（阶段 04）以松引用关联本表，刻意不建外键，
--       以保持审计独立、不阻断连接器删除（详见 README）。

-- -----------------------------------------------------------------------------
-- 来源: 07-tool-registry/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 07 — 工具注册与工具管理
-- 依赖：02-tenant-management（tool.tenant_id → tenant.id）、
--      03-user-rbac（tool 菜单权限、tool.manage 模块权限；权限范围 permission_scope 配合 role.tool_scopes）、
--      04-audit-center（工具调用记入 tool_call_audit；写操作经 @Audit 落 user_action_audit）、
--      05-policy-engine（Tool 执行前必须调用 Policy.evaluate，架构 §8）、
--      06-connector-management（tool.connector_id → connector.id，按需关联连接器）。
-- 作用：新增工具注册表（tool），实现 Tool Registry（注册 / 元数据 / JSON Schema 校验 / 权限元数据，
--      架构 §4.3）及管理后台工具管理全菜单（功能清单 §1.5），含 SQL 查询工具专项配置。
-- 与 Prisma 对齐：shellder-agent-server/prisma/migrations/20260529050000_tool_registry/migration.sql
--
-- 设计要点：
-- 1. V1 所有 Tool 必须经注册中心，禁止绕过（架构 §4.3）。
-- 2. 四类 Tool（执行计划 §3）：query / action / workflow / notification。
--    - query        查询型：只读 SQL（SQL Query Tool），关联 db_readonly 连接器，约束存于 config.sql。
--    - action       操作型：HTTP 写操作，关联 http 连接器，调用配置存于 config.http。
--    - workflow     流程型：编排 Query/Action/Notification（编排执行见 12/13），步骤存于 config.workflow。
--    - notification 通知型：消息通知接口，关联 notification 连接器，调用配置存于 config.http。
-- 3. Tool 按租户隔离（实施规格 §1.4）：tool.tenant_id 必须来自 tenant 表，非空；
--    (tenant_id, name) 唯一，避免同租户重名。
-- 4. inputSchema / outputSchema 为 JSON Schema；保存前由应用层（ajv）校验其本身合法性，
--    非法 JSON Schema 拒绝保存（验收标准 1）。调用测试时按 inputSchema 校验入参（验收标准）。
-- 5. 关联连接器（按需）：connector_id → connector.id，连接器删除后置空（ON DELETE SET NULL），
--    不阻断 Tool 历史；连接器恢复 / 重绑后可继续使用。
-- 6. 执行前必须走 Policy（架构 §8）：调用测试在 Policy 判定 deny / need_confirm 时不执行外部调用（验收标准 2）。
-- 7. SQL 查询工具（执行计划 §4.5）：config.sql 含表 / 字段白名单、最大返回行数、最大执行时长、SQL 模板；
--    测试时超行数 / 超时被拒绝（验收标准 3）。
-- 8. tenant_id 外键 ON DELETE RESTRICT，与审计 / 规则 / 连接器一致；平台内租户只禁用不删除。

-- CreateTable：Tool 注册元数据（按租户）
CREATE TABLE `agent_platform`.`tool` (
    `id`               CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`        CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
    `name`             VARCHAR(128) NOT NULL COMMENT 'Tool 名称（租户内唯一）',
    `description`      VARCHAR(512) NULL COMMENT 'Tool 描述',
    `type`             ENUM('query', 'action', 'workflow', 'notification') NOT NULL
                       COMMENT '类型：查询型 / 操作型 / 流程型 / 通知型',
    `status`           ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用 / 停用',
    `input_schema`     JSON         NOT NULL COMMENT '入参 JSON Schema（保存前校验合法性）',
    `output_schema`    JSON         NULL COMMENT '出参 JSON Schema（可选）',
    `permission_scope` VARCHAR(128) NULL COMMENT '权限范围 key（如 order:read），配合 role.tool_scopes / 连接器 allowedToolScopes',
    `risk_level`       ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'low' COMMENT '风险等级（Policy 评估输入）',
    `need_confirmation` BOOLEAN     NOT NULL DEFAULT false COMMENT '是否需人工确认（高风险 / 显式确认）',
    `timeout_ms`       INTEGER      NOT NULL DEFAULT 10000 COMMENT '执行超时（毫秒）',
    `idempotency_key`  VARCHAR(128) NULL COMMENT '幂等键模板（操作型重试去重），可空',
    `audit_event_type` VARCHAR(128) NULL COMMENT '工具调用审计事件类型标识',
    `connector_id`     CHAR(36)     NULL COMMENT '关联连接器，→ connector.id；连接器删除后置空',
    `config`           JSON         NOT NULL COMMENT '类型相关配置：query→sql / action,notification→http / workflow→workflow',
    `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`       DATETIME(3)  NOT NULL COMMENT '更新时间',

    INDEX `tool_tenant_id_idx` (`tenant_id`),
    INDEX `tool_type_idx` (`type`),
    INDEX `tool_status_idx` (`status`),
    INDEX `tool_risk_level_idx` (`risk_level`),
    INDEX `tool_connector_id_idx` (`connector_id`),
    INDEX `tool_tenant_id_type_status_idx` (`tenant_id`, `type`, `status`),
    UNIQUE INDEX `tool_tenant_id_name_key` (`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='工具注册元数据';

-- AddForeignKey
ALTER TABLE `agent_platform`.`tool` ADD CONSTRAINT `tool_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `agent_platform`.`tool` ADD CONSTRAINT `tool_connector_id_fkey`
    FOREIGN KEY (`connector_id`) REFERENCES `agent_platform`.`connector`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- config JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "sql": {                              -- query 型（SQL 查询工具，执行计划 §4.5）
--     "tableBlacklist": ["audit_log"],               -- 禁止访问的表黑名单（可空；空=不限制表，仅只读）
--     "fieldBlacklist": ["users.password_hash"],     -- 字段黑名单（可空；空=不限制字段）
--     "maxRows": 100,                     -- 最大返回行数（超出拒绝）
--     "maxExecutionMs": 3000,             -- 最大执行时长（超时拒绝）
--     "templates": [                      -- SQL 模板（SQL 模板管理）
--       { "id": "t1", "name": "按日期查订单", "sql": "SELECT id, amount FROM orders WHERE dt = :dt", "description": "" }
--     ]
--   },
--   "http": {                             -- action / notification 型
--     "method": "POST",                   -- HTTP 方法
--     "path": "/api/orders",              -- 相对连接器 target 的路径
--     "headers": { "X-Biz": "a" },        -- 附加请求头（非敏感；认证头由连接器凭证注入）
--     "bodyTemplate": {}                  -- 可选请求体模板
--   },
--   "workflow": {                         -- workflow 型
--     "steps": [ { "name": "下单", "toolId": "<tool.id>", "description": "" } ]
--   }
-- }
-- 备注：
--   - 工具调用审计（tool_call_audit，阶段 04）以 tool_id / tool_name 关联本表，刻意不建外键，
--     以保持审计独立、不阻断 Tool 删除。
--   - rule_hit.tool_name（阶段 05）记录触发 Policy 的 Tool 名称，亦为松引用。

-- -----------------------------------------------------------------------------
-- 来源: 08-session-message/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 08 — 会话与消息核心
-- 功能清单 §1.2 / §4.1 / §4.2；架构 §4.2 Session + Message
-- 依赖：02-tenant-management（tenant 表）
-- ================================================================

-- 会话表（Session 模块）
CREATE TABLE IF NOT EXISTS `agent_platform`.`session` (
  `id`               CHAR(36)     NOT NULL,
  `tenant_id`        CHAR(36)     NOT NULL,
  `user_id`          VARCHAR(256) NOT NULL COMMENT '主体 ID：管理端 user.id；Copilot 为 JWT sub',
  `title`            VARCHAR(256) DEFAULT NULL,
  `status`           ENUM('active','completed','failed','cancelled') NOT NULL DEFAULT 'active',
  `capability_type`  ENUM('qa','query','action','workflow') DEFAULT NULL,
  `summary`          TEXT         DEFAULT NULL,
  `has_task`         TINYINT(1)   NOT NULL DEFAULT 0,
  `has_confirmation` TINYINT(1)   NOT NULL DEFAULT 0,
  `last_message_at`  DATETIME(3)  DEFAULT NULL,
  `principal_context` JSON         DEFAULT NULL COMMENT '嵌入主体：externalUserId、scopeList',
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 租户外键（审计保留性数据，Restrict）
  CONSTRAINT `fk_session_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

  -- 索引（与 Prisma schema 对齐）
  INDEX `idx_session_tenant_id`          (`tenant_id`),
  INDEX `idx_session_user_id`            (`user_id`),
  INDEX `idx_session_status`             (`status`),
  INDEX `idx_session_capability_type`    (`capability_type`),
  INDEX `idx_session_tenant_status`      (`tenant_id`, `status`),
  INDEX `idx_session_tenant_user`        (`tenant_id`, `user_id`),
  INDEX `idx_session_last_message_at`    (`last_message_at`),
  INDEX `idx_session_created_at`         (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话';


-- 消息表（Message 模块 — 独立于 Session 模块，架构 §4.2）
CREATE TABLE IF NOT EXISTS `agent_platform`.`message` (
  `id`         CHAR(36)    NOT NULL,
  `session_id` CHAR(36)    NOT NULL,
  `type`       ENUM('user','system','tool','confirmation') NOT NULL,
  `role`       ENUM('user','assistant','system','tool')    NOT NULL DEFAULT 'user',
  `content`    JSON        NOT NULL,
  `seq`        INT         NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 级联删除：会话删除时关联消息一并清理
  CONSTRAINT `fk_message_session` FOREIGN KEY (`session_id`)
    REFERENCES `agent_platform`.`session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  -- 索引
  INDEX `idx_message_session_id`     (`session_id`),
  INDEX `idx_message_session_seq`    (`session_id`, `seq`),
  INDEX `idx_message_type`           (`type`),
  INDEX `idx_message_created_at`     (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话消息';

-- -----------------------------------------------------------------------------
-- 来源: 09-task-worker/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 09 — 任务中心与异步 Worker
-- 功能清单 §1.3 / §4.3 Task / §4.11 异步执行
-- 依赖：02-tenant-management（tenant 表）、08-session-message（session 表）
-- ================================================================

-- 任务表（Task 模块）
CREATE TABLE IF NOT EXISTS `agent_platform`.`task` (
  `id`               CHAR(36)     NOT NULL,
  `tenant_id`        CHAR(36)     NOT NULL,
  `session_id`       CHAR(36)     DEFAULT NULL,
  `user_id`          VARCHAR(256) DEFAULT NULL COMMENT '发起人：管理端 user.id；Copilot 为 JWT sub',
  `title`            VARCHAR(256) DEFAULT NULL,
  `type`             ENUM('sync','async','scheduled') NOT NULL DEFAULT 'async',
  `status`           ENUM('pending','running','completed','failed','cancelled','timeout') NOT NULL DEFAULT 'pending',
  `capability_type`  ENUM('qa','query','action','workflow') DEFAULT NULL,
  `current_node`     VARCHAR(256) DEFAULT NULL,
  `input`            JSON         DEFAULT NULL,
  `output`           JSON         DEFAULT NULL,
  `retry_count`      INT          NOT NULL DEFAULT 0,
  `max_retries`      INT          NOT NULL DEFAULT 3,
  `timeout_ms`       INT          NOT NULL DEFAULT 300000,
  `fail_reason`      TEXT         DEFAULT NULL,
  `job_id`           VARCHAR(128) DEFAULT NULL,
  `scheduled_at`     DATETIME(3)  DEFAULT NULL,
  `started_at`       DATETIME(3)  DEFAULT NULL,
  `completed_at`     DATETIME(3)  DEFAULT NULL,
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 租户外键（任务为保留性数据，Restrict）
  CONSTRAINT `fk_task_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

  -- 索引（与 Prisma schema 对齐）
  INDEX `idx_task_tenant_id`           (`tenant_id`),
  INDEX `idx_task_session_id`          (`session_id`),
  INDEX `idx_task_user_id`             (`user_id`),
  INDEX `idx_task_status`              (`status`),
  INDEX `idx_task_type`                (`type`),
  INDEX `idx_task_capability_type`     (`capability_type`),
  INDEX `idx_task_tenant_status`       (`tenant_id`, `status`),
  INDEX `idx_task_tenant_type_status`  (`tenant_id`, `type`, `status`),
  INDEX `idx_task_job_id`              (`job_id`),
  INDEX `idx_task_created_at`          (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务';


-- 任务步骤表（长任务跟踪 §5.3）
CREATE TABLE IF NOT EXISTS `agent_platform`.`task_step` (
  `id`            CHAR(36)     NOT NULL,
  `task_id`       CHAR(36)     NOT NULL,
  `seq`           INT          NOT NULL DEFAULT 0,
  `name`          VARCHAR(256) NOT NULL,
  `description`   VARCHAR(512) DEFAULT NULL,
  `status`        ENUM('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `input`         JSON         DEFAULT NULL,
  `output`        JSON         DEFAULT NULL,
  `tool_name`     VARCHAR(128) DEFAULT NULL,
  `fail_reason`   TEXT         DEFAULT NULL,
  `duration_ms`   INT          DEFAULT NULL,
  `started_at`    DATETIME(3)  DEFAULT NULL,
  `completed_at`  DATETIME(3)  DEFAULT NULL,
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 级联删除：任务删除时关联步骤一并清理
  CONSTRAINT `fk_task_step_task` FOREIGN KEY (`task_id`)
    REFERENCES `agent_platform`.`task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  -- 索引
  INDEX `idx_task_step_task_id`      (`task_id`),
  INDEX `idx_task_step_task_seq`     (`task_id`, `seq`),
  INDEX `idx_task_step_status`       (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务步骤';


-- 任务执行日志表（§5.4 执行日志）
CREATE TABLE IF NOT EXISTS `agent_platform`.`task_log` (
  `id`         CHAR(36)    NOT NULL,
  `task_id`    CHAR(36)    NOT NULL,
  `step_id`    CHAR(36)    DEFAULT NULL,
  `type`       ENUM('state_change','tool_call','error','confirmation','notification','retry','custom') NOT NULL,
  `level`      ENUM('info','warn','error') NOT NULL DEFAULT 'info',
  `message`    TEXT        NOT NULL,
  `detail`     JSON        DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  -- 级联删除：任务删除时关联日志一并清理
  CONSTRAINT `fk_task_log_task` FOREIGN KEY (`task_id`)
    REFERENCES `agent_platform`.`task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,

  -- 索引
  INDEX `idx_task_log_task_id`       (`task_id`),
  INDEX `idx_task_log_task_type`     (`task_id`, `type`),
  INDEX `idx_task_log_step_id`       (`step_id`),
  INDEX `idx_task_log_level`         (`level`),
  INDEX `idx_task_log_created_at`    (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务执行日志';

-- -----------------------------------------------------------------------------
-- 来源: 10-capability-routing/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 10 — 能力路由（Capability Routing）
-- 功能清单 §1.4 / 架构 Capability Routing
-- 依赖：02-tenant-management（capability.tenant_id / routing_rule.tenant_id → tenant.id）
--       05-policy-engine（路由引擎调用 Policy.evaluate 判断 needConfirmation）
--       07-tool-registry（路由规则 tool_ids 引用 tool.id）
-- ================================================================
--
-- 设计要点：
-- 1. 能力目录（capability）：维护平台四类能力清单（qa/query/action/workflow），
--    含描述、适用系统、依赖工具、权限要求。
-- 2. 路由规则（routing_rule）：配置能力与 Tool/条件的关联，定义每类能力可调用范围。
-- 3. 按租户隔离（实施规格 §1.4）：tenant_id 必须来自 tenant 表，非空。
-- 4. 能力目录删除时级联删除关联路由规则（routing_rule.capability_id ON DELETE CASCADE）。
-- 5. tenant_id 外键 ON DELETE RESTRICT，与前序模块一致；平台内租户只禁用不删除。
-- 6. (tenant_id, name) 唯一约束，避免同租户重名能力。

-- CreateTable：能力目录（按租户）
CREATE TABLE IF NOT EXISTS `agent_platform`.`capability` (
  `id`                      CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`               CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
  `type`                    ENUM('qa', 'query', 'action', 'workflow') NOT NULL
                            COMMENT '能力类型：问答型/查询型/操作型/流程型',
  `name`                    VARCHAR(128) NOT NULL COMMENT '能力名称（租户内唯一）',
  `description`             VARCHAR(512) NULL COMMENT '能力描述',
  `applicable_system`       VARCHAR(256) NULL COMMENT '适用系统/业务场景',
  `dependent_tools`         JSON         NULL COMMENT '依赖的工具 ID 列表（string[]）',
  `permission_requirements` JSON         NULL COMMENT '权限要求（permissionScope 列表，string[]）',
  `priority`                INTEGER      NOT NULL DEFAULT 100 COMMENT '路由优先级，数值越小越优先',
  `status`                  ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
  `created_at`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`              DATETIME(3)  NOT NULL COMMENT '更新时间',

  UNIQUE INDEX `capability_tenant_id_name_key` (`tenant_id`, `name`),
  INDEX `capability_tenant_id_idx` (`tenant_id`),
  INDEX `capability_type_idx` (`type`),
  INDEX `capability_status_idx` (`status`),
  INDEX `capability_tenant_id_type_status_idx` (`tenant_id`, `type`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='能力目录';


-- CreateTable：路由规则（从属于能力，按租户隔离）
CREATE TABLE IF NOT EXISTS `agent_platform`.`routing_rule` (
  `id`                CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`         CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
  `capability_id`     CHAR(36)     NOT NULL COMMENT '关联能力，→ capability.id',
  `name`              VARCHAR(128) NOT NULL COMMENT '规则名称',
  `description`       VARCHAR(512) NULL COMMENT '规则说明',
  `conditions`        JSON         NOT NULL COMMENT '匹配条件 DSL（JSON）：keywords/patterns/intents',
  `tool_ids`          JSON         NULL COMMENT '命中时可调用的工具 ID 列表（string[]）',
  `priority`          INTEGER      NOT NULL DEFAULT 100 COMMENT '同能力内优先级，数值越小越优先',
  `need_confirmation` BOOLEAN      NOT NULL DEFAULT false COMMENT '是否需人工确认（路由级）',
  `status`            ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`        DATETIME(3)  NOT NULL COMMENT '更新时间',

  INDEX `routing_rule_tenant_id_idx` (`tenant_id`),
  INDEX `routing_rule_capability_id_idx` (`capability_id`),
  INDEX `routing_rule_tenant_id_status_priority_idx` (`tenant_id`, `status`, `priority`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='能力路由规则';


-- AddForeignKey
ALTER TABLE `agent_platform`.`capability` ADD CONSTRAINT `capability_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_platform`.`routing_rule` ADD CONSTRAINT `routing_rule_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_platform`.`routing_rule` ADD CONSTRAINT `routing_rule_capability_id_fkey`
    FOREIGN KEY (`capability_id`) REFERENCES `agent_platform`.`capability`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- conditions JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "keywords": ["查询", "订单", "统计"],        -- 关键词列表（命中任一即匹配该子句）
--   "patterns": ["^查.*订单", "\\d+月报表"],     -- 正则表达式模式（命中任一即匹配）
--   "intents": ["order_query", "report_gen"]    -- 意图标签（保留，供 NLU 引擎扩展）
-- }
--
-- dependent_tools JSON 约定结构：
-- ["<tool.id>", "<tool.id>"]  -- 该能力依赖的 Tool ID 列表
--
-- permission_requirements JSON 约定结构：
-- ["order:read", "report:view"]  -- 使用该能力需要的权限范围 key 列表

-- -----------------------------------------------------------------------------
-- 来源: 11-skill-management/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 11 — 技能书管理（功能清单 §1.5A / 架构 Skill Management）
-- 依赖：01-bootstrap, 02-tenant-management, 07-tool-registry, 10-capability-routing
-- ================================================================

-- 技能书主表
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill` (
  `id`                     CHAR(36)     NOT NULL,
  `tenant_id`              CHAR(36)     NOT NULL,
  `code`                   VARCHAR(64)  NOT NULL,
  `name`                   VARCHAR(128) NOT NULL,
  `description`            VARCHAR(512) DEFAULT NULL,
  `category`               VARCHAR(64)  DEFAULT NULL,
  `capability_type`        ENUM('qa','query','action','workflow') NOT NULL,
  `status`                 ENUM('draft','enabled','disabled') NOT NULL DEFAULT 'draft',
  `version`                INT          NOT NULL DEFAULT 1,
  `risk_level`             ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  `need_confirmation`      TINYINT(1)   NOT NULL DEFAULT 0,
  `permission_scope`       VARCHAR(128) DEFAULT NULL,
  `entry_mode`             ENUM('tool','workflow') NOT NULL,
  `entry_tool_id`          CHAR(36)     DEFAULT NULL,
  `workflow_tool_id`       CHAR(36)     DEFAULT NULL,
  `input_schema`           JSON         DEFAULT NULL,
  `output_schema`          JSON         DEFAULT NULL,
  `preconditions`          JSON         DEFAULT NULL,
  `result_template`        TEXT         DEFAULT NULL,
  `missing_param_strategy` JSON         DEFAULT NULL,
  `failure_hint`           VARCHAR(512) DEFAULT NULL,
  `remark`                 VARCHAR(512) DEFAULT NULL,
  `created_at`             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`             DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `skill_tenant_id_code_key` (`tenant_id`, `code`),
  INDEX `idx_skill_tenant_id` (`tenant_id`),
  INDEX `idx_skill_capability_type` (`capability_type`),
  INDEX `idx_skill_status` (`status`),
  INDEX `idx_skill_risk_level` (`risk_level`),
  INDEX `idx_skill_tenant_cap_status` (`tenant_id`, `capability_type`, `status`),
  CONSTRAINT `fk_skill_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书';

-- 技能书触发示例
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill_trigger` (
  `id`           CHAR(36)     NOT NULL,
  `skill_id`     CHAR(36)     NOT NULL,
  `trigger_text` VARCHAR(512) NOT NULL,
  `trigger_type` VARCHAR(32)  NOT NULL DEFAULT 'keyword',
  `priority`     INT          NOT NULL DEFAULT 100,
  PRIMARY KEY (`id`),
  INDEX `idx_skill_trigger_skill_id` (`skill_id`),
  CONSTRAINT `fk_skill_trigger_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书触发示例';

-- 技能书绑定关系
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill_binding` (
  `id`           CHAR(36)    NOT NULL,
  `skill_id`     CHAR(36)    NOT NULL,
  `binding_type` VARCHAR(32) NOT NULL,
  `target_id`    CHAR(36)    NOT NULL,
  `order_no`     INT         NOT NULL DEFAULT 0,
  `config`       JSON        DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_skill_binding_skill_id` (`skill_id`),
  CONSTRAINT `fk_skill_binding_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书绑定关系';

-- 技能书执行记录
CREATE TABLE IF NOT EXISTS `agent_platform`.`skill_execution_log` (
  `id`              CHAR(36)      NOT NULL,
  `skill_id`        CHAR(36)      NOT NULL,
  `session_id`      CHAR(36)      DEFAULT NULL,
  `task_id`         CHAR(36)      DEFAULT NULL,
  `tenant_id`       CHAR(36)      NOT NULL,
  `user_id`         VARCHAR(256)  DEFAULT NULL COMMENT '执行人：管理端 user.id；Copilot 为 JWT sub',
  `status`          ENUM('success','failed','running','timeout') NOT NULL DEFAULT 'running',
  `input_snapshot`  JSON          DEFAULT NULL,
  `output_snapshot` JSON          DEFAULT NULL,
  `error_summary`   VARCHAR(1024) DEFAULT NULL,
  `started_at`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at`     DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_sel_skill_id` (`skill_id`),
  INDEX `idx_sel_tenant_id` (`tenant_id`),
  INDEX `idx_sel_session_id` (`session_id`),
  INDEX `idx_sel_task_id` (`task_id`),
  INDEX `idx_sel_user_id` (`user_id`),
  INDEX `idx_sel_status` (`status`),
  INDEX `idx_sel_started_at` (`started_at`),
  CONSTRAINT `fk_sel_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_sel_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能书执行记录';

-- -----------------------------------------------------------------------------
-- 来源: 12-knowledge-base/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 11A — 知识库代理与知识库管理（功能清单 §1.7 / 架构 Knowledge）
-- 依赖：01-bootstrap, 02-tenant-management
-- V1 仅保留 knowledge_base 租户绑定元数据；内容/召回由 wiki 知识库服务 承担。
-- 自建子表 kb_data_source / kb_document / kb_chunk / kb_embedding_task 已废弃，不在本 SQL 交付。
-- ================================================================

-- 知识库主表（租户 wiki wiki 路径绑定）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库租户绑定（wiki 代理）';

-- -----------------------------------------------------------------------------
-- 来源: 12-knowledge-base/schema-pathy-binding.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 增量：wiki 代理模式 — knowledge_base 增加 wiki 路径绑定
-- 依赖：project-sql/12-knowledge-base/schema.sql 已执行

ALTER TABLE `agent_platform`.`knowledge_base`
  ADD COLUMN `wiki_prefix` VARCHAR(256) NULL
    COMMENT 'wiki wiki 子路径前缀，如 tenants/{tenantId}/；空则运行时使用默认'
    AFTER `description`;

-- -----------------------------------------------------------------------------
-- 来源: 13-agent-runtime/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 12 — Agent 运行时与流式响应（Phase 12）
-- 功能清单 §4.5 Agent Runtime / 架构 §4.2 / 执行计划 §4
-- 依赖：08-session-message（session 表 status 枚举）
--       09-task-worker（task 表 status 枚举）
-- ================================================================
--
-- 本阶段无新增表。
-- 增量变更：为 session 和 task 表的状态枚举新增 'pending_confirm' 值，
-- 支持确认中断场景（架构 §4.5 / 执行计划 §4.3）。
-- Agent Runtime 运行时数据流经已有的 session、message、task 表。

-- 为 session.status 枚举新增 pending_confirm
ALTER TABLE `agent_platform`.`session`
  MODIFY COLUMN `status` ENUM(
    'active',
    'completed',
    'failed',
    'cancelled',
    'pending_confirm'
  ) NOT NULL DEFAULT 'active';

-- 为 task.status 枚举新增 pending_confirm
ALTER TABLE `agent_platform`.`task`
  MODIFY COLUMN `status` ENUM(
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'timeout',
    'pending_confirm'
  ) NOT NULL DEFAULT 'pending';

-- -----------------------------------------------------------------------------
-- 来源: 14-business-capabilities/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 13 — 四类业务能力（执行计划序号 13，SQL 目录序号 14）
-- 功能清单 §5.1–§5.4 / 架构 §4.3 / §4.5
-- 依赖：07-tool-registry, 08-session-message, 09-task-worker,
--       10-capability-routing, 11-skill-management, 12-knowledge-base,
--       13-agent-runtime
-- ================================================================
--
-- 本阶段无新建表。
--
-- 四类业务能力（问答型 / 查询型 / 操作型 / 流程型）在代码层实现，
-- 数据流经已有的表结构：
--   - session（08）：记录 capability_type
--   - message（08）：记录能力执行过程消息（路由结果、引用、中间结果）
--   - task / task_step / task_log（09）：流程型任务状态化、步骤跟踪、执行日志
--   - tool（07）：四类 Tool 定义及 config（sql/http/workflow）
--   - capability / routing_rule（10）：能力目录与路由规则
--   - skill（11）：技能书与 Tool 绑定
--   - knowledge_base（12）+ wiki 代理 recall（12）：问答型知识库检索
--
-- 增量变更：
-- 1. 为 message.content 新增统一结果结构约定（仅应用层约束，数据库 JSON 列不变）。
-- 2. 为 task 表新增索引以优化流程型任务按 capability_type 查询。
-- ================================================================

-- 优化：为 task.capability_type + status 组合查询添加索引（流程型长任务进度查询）
-- 注：idx_task_capability_type 已存在（09），此处为组合索引补充
-- MySQL 不支持 CREATE INDEX IF NOT EXISTS；可重复执行时用下方条件 DDL
SET @__idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = 'agent_platform'
    AND table_name = 'task'
    AND index_name = 'idx_task_cap_type_status_created'
);
SET @__sql := IF(
  @__idx_exists = 0,
  'CREATE INDEX `idx_task_cap_type_status_created` ON `agent_platform`.`task` (`capability_type`, `status`, `created_at`)',
  'SELECT 1'
);
PREPARE __stmt FROM @__sql;
EXECUTE __stmt;
DEALLOCATE PREPARE __stmt;

-- 统一结果结构约定（应用层 JSON，非数据库约束）：
-- message.content 当 type='system' 且为能力执行结果时，遵循以下结构：
-- {
--   "capabilityType": "qa" | "query" | "action" | "workflow",
--   "data": { ... },           -- 各能力的具体输出
--   "citations": [...],        -- 问答型引用依据（可选）
--   "steps": [...],            -- 流程型步骤结果（可选）
--   "status": "success" | "failed" | "partial" | "pending_confirm"
-- }
--
-- 查询型 data 结构：
-- { "text": "...", "rows": [...], "rowCount": N, "executedSql": "..." }
--
-- 操作型 data 结构：
-- { "text": "...", "httpStatus": N, "response": {...} }
--
-- 流程型 data 结构：
-- { "text": "...", "taskId": "<task.id>" }
--
-- 问答型 data 结构：
-- { "text": "..." }

-- -----------------------------------------------------------------------------
-- 来源: 15-approval-center/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 14 — 审批中心（Phase 14 / project-sql/15-approval-center）
-- 功能清单 §1.8 / 架构 §4.5 人工确认中断 / 执行计划 §5
-- 依赖：02-tenant-management（tenant 表）
--       08-session-message（session / message 表）
--       09-task-worker（task 表）
-- ================================================================
--
-- 设计要点：
-- 1. approval 表记录高风险动作待确认事项的全生命周期（创建→确认/驳回/超时）。
-- 2. 与 Agent Runtime 联动（执行计划 §4）：
--    - needConfirmation 命中 → 创建 approval 记录，session/task 状态 pending_confirm
--    - 确认 → Runtime 从断点继续执行 Tool
--    - 驳回 → 任务失败，Message 写入驳回原因
--    - 超时 → job-worker 定时标记超时（09）
-- 3. 按租户隔离（实施规格 §1.4）：tenant_id 必须来自 tenant 表。
-- 4. 审批操作记入用户操作审计（04）。
-- 5. 风险动作审计页聚合审批 + Tool 调用（04）。

-- CreateTable：审批记录
CREATE TABLE `agent_platform`.`approval` (
    `id`              CHAR(36)     NOT NULL COMMENT '主键',
    `tenant_id`       CHAR(36)     NOT NULL COMMENT '所属租户 → tenant.id',
    `session_id`      CHAR(36)     NULL     COMMENT '关联会话 ID',
    `task_id`         CHAR(36)     NULL     COMMENT '关联任务 ID',
    `message_id`      CHAR(36)     NULL     COMMENT '关联确认消息 ID',
    `initiator_id`    VARCHAR(256) NULL     COMMENT '发起人：管理端 user.id；Copilot 为 JWT sub',
    `initiator_name`  VARCHAR(128) NULL     COMMENT '发起人名称快照',
    `action_type`     VARCHAR(128) NOT NULL COMMENT '动作类型/Tool 名称',
    `action_summary`  TEXT         NULL     COMMENT '动作摘要（操作背景、原始请求概要）',
    `risk_level`      ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'high'
                      COMMENT '风险等级',
    `impact_scope`    VARCHAR(512) NULL     COMMENT '影响范围描述',
    `tool_ids`        JSON         NULL     COMMENT '待执行 Tool ID 列表',
    `request_context` JSON         NULL     COMMENT '原始请求上下文（完整运行时上下文快照）',
    `status`          ENUM('pending', 'approved', 'rejected', 'timeout') NOT NULL DEFAULT 'pending'
                      COMMENT '审批状态：待确认/已确认/已驳回/已超时',
    `reviewer_id`     CHAR(36)     NULL     COMMENT '审批人 user.id',
    `reviewer_name`   VARCHAR(128) NULL     COMMENT '审批人名称快照',
    `opinion`         TEXT         NULL     COMMENT '审批意见',
    `reviewed_at`     DATETIME(3)  NULL     COMMENT '审批时间',
    `expired_at`      DATETIME(3)  NULL     COMMENT '超时时间（由创建时计算）',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',

    INDEX `approval_tenant_id_idx` (`tenant_id`),
    INDEX `approval_session_id_idx` (`session_id`),
    INDEX `approval_task_id_idx` (`task_id`),
    INDEX `approval_status_idx` (`status`),
    INDEX `approval_initiator_id_idx` (`initiator_id`),
    INDEX `approval_reviewer_id_idx` (`reviewer_id`),
    INDEX `approval_action_type_idx` (`action_type`),
    INDEX `approval_risk_level_idx` (`risk_level`),
    INDEX `approval_tenant_status_idx` (`tenant_id`, `status`),
    INDEX `approval_created_at_idx` (`created_at`),
    INDEX `approval_reviewed_at_idx` (`reviewed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='高风险动作审批';

-- AddForeignKey
ALTER TABLE `agent_platform`.`approval` ADD CONSTRAINT `approval_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 来源: 16-openapi/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ───────────────────────────────────────────────────────────
-- 阶段 15 / SQL 目录 16 — OpenAPI 对外接口与管理
-- 前置依赖：01-bootstrap ~ 15-approval-center
-- ───────────────────────────────────────────────────────────

-- OpenAPI 接入应用（功能清单 §1.12 / §3）
CREATE TABLE IF NOT EXISTS `agent_platform`.`openapi_app` (
  `id`                 CHAR(36)     NOT NULL,
  `name`               VARCHAR(128) NOT NULL,
  `description`        VARCHAR(512) NULL,
  `client_id`          VARCHAR(64)  NOT NULL,
  `client_secret_hash` VARCHAR(255) NOT NULL,
  `status`             ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `allowed_tenant_ids` JSON         NOT NULL,
  `allowed_capabilities` JSON       NOT NULL,
  `rate_limit_config`  JSON         NULL,
  `last_called_at`     DATETIME(3)  NULL,
  `created_by`         CHAR(36)     NULL,
  `created_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`         DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `openapi_app_name_key` (`name`),
  UNIQUE KEY `openapi_app_client_id_key` (`client_id`),
  INDEX `openapi_app_client_id_idx` (`client_id`),
  INDEX `openapi_app_status_idx` (`status`),
  INDEX `openapi_app_created_at_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OpenAPI 接入应用';

-- OpenAPI 调用日志（功能清单 §1.12 调用日志）
CREATE TABLE IF NOT EXISTS `agent_platform`.`openapi_call_log` (
  `id`              CHAR(36)     NOT NULL,
  `app_id`          CHAR(36)     NOT NULL,
  `tenant_id`       CHAR(36)     NULL,
  `method`          VARCHAR(10)  NOT NULL,
  `path`            VARCHAR(256) NOT NULL,
  `status_code`     INT          NOT NULL,
  `status`          ENUM('success','failed','rate_limited') NOT NULL DEFAULT 'success',
  `ip`              VARCHAR(64)  NULL,
  `duration_ms`     INT          NULL,
  `error_message`   VARCHAR(1024) NULL,
  `request_summary` TEXT         NULL,
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `openapi_call_log_app_id_idx` (`app_id`),
  INDEX `openapi_call_log_tenant_id_idx` (`tenant_id`),
  INDEX `openapi_call_log_status_idx` (`status`),
  INDEX `openapi_call_log_path_idx` (`path`),
  INDEX `openapi_call_log_created_at_idx` (`created_at`),
  INDEX `openapi_call_log_app_id_status_idx` (`app_id`, `status`),
  INDEX `openapi_call_log_app_id_created_at_idx` (`app_id`, `created_at`),
  CONSTRAINT `openapi_call_log_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `agent_platform`.`openapi_app`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `openapi_call_log_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OpenAPI 调用日志';

-- -----------------------------------------------------------------------------
-- 来源: 17-session-debug-console/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 16 — 会话管理与调试台（Phase 16 / project-sql/17-session-debug-console）
-- 功能清单 §1.2 完整 Web（详情、消息、调试台）
-- 依赖：08-session-message（session / message 表）
--       09-task-worker（task 表）
--       13-agent-runtime
--       14-business-capabilities
-- ================================================================
--
-- 本阶段为 Web 深化，后端 API 主要在 08–13 已具备。
-- 本阶段聚焦 UI/UX 与联调，不新增数据库表。
--
-- 数据流经已有表结构：
--   - session（08）：会话详情展示、调试会话创建
--   - message（08）：消息记录列表、类型筛选、时间线
--   - task / task_step / task_log（09）：关联任务展示
--   - capability / routing_rule（10）：调试台路由结果展示
--
-- 增量变更：无。
-- 所有功能基于已有 session、message、task 等表实现。
-- ================================================================

-- -----------------------------------------------------------------------------
-- 来源: 18-workbench/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 17 — 工作台（Phase 17 / project-sql/18-workbench）
-- 功能清单 §1.1 / 执行计划 §17
-- 依赖：04-audit-center（tool_call_audit 表）
--       07-tool-registry（tool 表）
--       09-task-worker（task 表）
--       15-approval-center（approval 表）
-- ================================================================
--
-- 本模块为纯聚合读取模块，不新增数据库表。
-- 工作台 Dashboard API 通过聚合查询以下前序表产生数据：
--
--   1. tool_call_audit（阶段 04）：工具成功率、失败率、平均响应时长
--      - 按 status 统计 success / failed 数量
--      - 按 duration_ms 计算平均响应时长
--      - 按 created_at 限定时间范围（默认近 7 天）
--
--   2. approval（阶段 14 / project-sql/15-approval-center）：高风险动作待确认列表
--      - 查询 status = 'pending' 的记录
--      - 工作台展示 Top 10 并提供跳转审批中心入口
--
--   3. task（阶段 09）：最近异常任务
--      - 查询 status IN ('failed', 'timeout') 的记录
--      - 工作台展示 Top 10 并提供跳转任务中心入口
--
-- 以上查询均按租户隔离（tenantId），非超管仅可见其绑定租户数据。
--
-- 无新增表、无新增索引、无结构变更。
-- ================================================================

-- -----------------------------------------------------------------------------
-- 来源: 19-system-settings/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ============================================================
-- 阶段 18 — 系统设置（功能清单 §1.13）
-- 新增表：system_config、notification_template
-- 前序依赖：01-bootstrap（MySQL/Prisma 基线）、09-task-worker
-- ============================================================

-- 系统配置 KV 表
CREATE TABLE IF NOT EXISTS `agent_platform`.`system_config` (
  `id`           CHAR(36)     NOT NULL,
  `config_group` VARCHAR(64)  NOT NULL COMMENT '配置分组：basic / model / notification',
  `config_key`   VARCHAR(128) NOT NULL COMMENT '配置键，全局唯一',
  `config_value` TEXT         NOT NULL COMMENT '配置值（JSON 字符串或纯文本）',
  `description`  VARCHAR(512) NULL     COMMENT '配置说明',
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`),
  KEY `idx_config_group` (`config_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置 KV';

-- 通知模板表
CREATE TABLE IF NOT EXISTS `agent_platform`.`notification_template` (
  `id`            CHAR(36)     NOT NULL,
  `type`          ENUM('approval','task_complete','exception') NOT NULL COMMENT '模板类型',
  `name`          VARCHAR(128) NOT NULL COMMENT '模板名称',
  `subject`       VARCHAR(256) NULL     COMMENT '模板主题',
  `body`          TEXT         NOT NULL COMMENT '模板内容（支持 {{var}} 变量占位符）',
  `enabled`       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用',
  `connector_id`  CHAR(36)     NULL     COMMENT '关联通知连接器 ID（connector.type=notification）',
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_name` (`type`, `name`),
  KEY `idx_type` (`type`),
  KEY `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知模板';

-- -----------------------------------------------------------------------------
-- 来源: 20-embedded-copilot/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 19 — 嵌入式 Copilot（Phase 19 / project-sql/20-embedded-copilot）
-- 功能清单 §2 / 架构 §4.1 接入层
-- 依赖：02-tenant-management（tenant 表）
--       16-openapi（openapi_app 表）
-- ================================================================
--
-- 设计要点：
-- 1. copilot_config 表存储每个租户/应用的 Copilot 嵌入配置。
-- 2. 复用 OpenAPI（阶段 15）的鉴权与会话接口，不重复建会话表。
-- 3. 换票机制：业务系统通过 externalToken 换取 Agent JWT，
--    验证逻辑在代码层实现（非数据库层面）。
-- 4. copilot_config 控制嵌入域名白名单、主题、功能开关等。

-- Copilot 嵌入配置（每个 OpenAPI 应用可关联一份 Copilot 配置）
CREATE TABLE IF NOT EXISTS `agent_platform`.`copilot_config` (
  `id`                   CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`            CHAR(36)     NOT NULL COMMENT '所属租户 → tenant.id',
  `app_id`               CHAR(36)     NOT NULL COMMENT '关联 OpenAPI 应用 → openapi_app.id',
  `name`                 VARCHAR(128) NOT NULL COMMENT '配置名称（便于管理）',
  `status`               ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用状态',
  `domain_whitelist`     JSON         NULL     COMMENT '允许嵌入的域名列表（iframe 安全）',
  `theme`                JSON         NULL     COMMENT '主题配置（primaryColor, logo, title 等）',
  `features`             JSON         NULL     COMMENT '功能开关（enableHistory, enableTask, enableConfirmation 等）',
  `welcome_message`      TEXT         NULL     COMMENT '欢迎语',
  `placeholder`          VARCHAR(256) NULL     COMMENT '输入框占位文字',
  `max_history_messages` INT          NOT NULL DEFAULT 50 COMMENT '历史消息最大加载条数',
  `token_ttl_seconds`    INT          NOT NULL DEFAULT 3600 COMMENT '换票 Token 有效期（秒）',
  `created_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',

  PRIMARY KEY (`id`),
  UNIQUE KEY `copilot_config_app_id_key` (`app_id`),
  INDEX `copilot_config_tenant_id_idx` (`tenant_id`),
  INDEX `copilot_config_status_idx` (`status`),

  CONSTRAINT `copilot_config_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `copilot_config_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `agent_platform`.`openapi_app`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='嵌入式 Copilot 配置';

-- -----------------------------------------------------------------------------
-- 来源: 21-prompt-management/schema.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ============================================================
-- 阶段 21 — Prompt 管理（方案 §5.3）
-- 新增表：prompt_template、prompt_version、prompt_binding
-- 前序依赖：02-tenant-management、03-user-rbac、04-audit-center、18-system-settings
-- ============================================================

-- 逻辑模板（SSOT 元数据）
CREATE TABLE IF NOT EXISTS `agent_platform`.`prompt_template` (
  `id`               CHAR(36)     NOT NULL COMMENT '主键',
  `prompt_key`       VARCHAR(128) NOT NULL COMMENT '全局逻辑键，如 query.nl2sql.system',
  `name`             VARCHAR(128) NOT NULL COMMENT '展示名',
  `description`      VARCHAR(512) NULL     COMMENT '说明、适用链路',
  `category`         ENUM('qa','query','sql_conversion','connector','routing','runtime','common') NOT NULL COMMENT '分类',
  `role`             ENUM('system','user','fragment') NOT NULL COMMENT 'LLM 消息角色',
  `scope`            ENUM('global','tenant') NOT NULL DEFAULT 'global' COMMENT '作用域',
  `tenant_id`        CHAR(36)     NULL     COMMENT 'scope=tenant 时必填 → tenant.id',
  `variable_schema`  JSON         NULL     COMMENT '变量 JSON Schema',
  `status`           ENUM('active','archived') NOT NULL DEFAULT 'active' COMMENT '模板状态',
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prompt_key_scope_tenant` (`prompt_key`, `scope`, `tenant_id`),
  KEY `idx_prompt_category` (`category`),
  KEY `idx_prompt_status` (`status`),
  KEY `idx_prompt_tenant` (`tenant_id`),
  CONSTRAINT `prompt_template_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prompt 逻辑模板';

-- 不可变版本（正文与发布状态）
CREATE TABLE IF NOT EXISTS `agent_platform`.`prompt_version` (
  `id`            CHAR(36)     NOT NULL COMMENT '主键',
  `template_id`   CHAR(36)     NOT NULL COMMENT '→ prompt_template.id',
  `version`       INT          NOT NULL COMMENT '递增版本号',
  `content`       MEDIUMTEXT   NOT NULL COMMENT '模板正文，支持 {{var}}',
  `content_hash`  CHAR(64)     NOT NULL COMMENT 'SHA-256 内容摘要',
  `changelog`     VARCHAR(512) NULL     COMMENT '变更说明',
  `state`         ENUM('draft','published','deprecated') NOT NULL DEFAULT 'draft' COMMENT '版本状态',
  `published_at`  DATETIME(3)  NULL     COMMENT '发布时间',
  `published_by`  CHAR(36)     NULL     COMMENT '发布人用户 ID',
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_version` (`template_id`, `version`),
  KEY `idx_prompt_version_state` (`template_id`, `state`),
  CONSTRAINT `prompt_version_template_id_fkey`
    FOREIGN KEY (`template_id`) REFERENCES `agent_platform`.`prompt_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prompt 模板版本';

-- 业务锚点 → 逻辑键绑定（可选租户覆盖）
CREATE TABLE IF NOT EXISTS `agent_platform`.`prompt_binding` (
  `id`          CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`   CHAR(36)     NULL     COMMENT '租户覆盖，NULL 表示全局默认',
  `bind_type`   ENUM('capability','skill','tool','connector','default') NOT NULL COMMENT '绑定类型',
  `bind_id`     CHAR(36)     NULL     COMMENT '业务对象 ID，可空',
  `prompt_key`  VARCHAR(128) NOT NULL COMMENT '引用的逻辑键',
  `priority`    INT          NOT NULL DEFAULT 0 COMMENT '多绑定优先级，越大越优先',
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_prompt_binding_tenant` (`tenant_id`),
  KEY `idx_prompt_binding_lookup` (`bind_type`, `bind_id`, `tenant_id`),
  KEY `idx_prompt_binding_key` (`prompt_key`),
  CONSTRAINT `prompt_binding_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prompt 业务绑定';


