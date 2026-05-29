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
CREATE TABLE `connector` (
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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `connector` ADD CONSTRAINT `connector_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
