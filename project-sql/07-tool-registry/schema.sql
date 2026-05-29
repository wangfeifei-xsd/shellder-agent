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
CREATE TABLE `tool` (
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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tool` ADD CONSTRAINT `tool_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tool` ADD CONSTRAINT `tool_connector_id_fkey`
    FOREIGN KEY (`connector_id`) REFERENCES `connector`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- config JSON 约定结构（应用层维护，DB 不强约束）：
-- {
--   "sql": {                              -- query 型（SQL 查询工具，执行计划 §4.5）
--     "tableWhitelist": ["orders", "order_items"],   -- 允许访问的表白名单（必填，命中外的表拒绝）
--     "fieldWhitelist": ["orders.id", "orders.amount"],-- 字段白名单（可空；空=不限制字段）
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
