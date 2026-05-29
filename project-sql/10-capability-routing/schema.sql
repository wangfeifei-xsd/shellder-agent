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
CREATE TABLE IF NOT EXISTS `capability` (
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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable：路由规则（从属于能力，按租户隔离）
CREATE TABLE IF NOT EXISTS `routing_rule` (
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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- AddForeignKey
ALTER TABLE `capability` ADD CONSTRAINT `capability_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `routing_rule` ADD CONSTRAINT `routing_rule_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `routing_rule` ADD CONSTRAINT `routing_rule_capability_id_fkey`
    FOREIGN KEY (`capability_id`) REFERENCES `capability`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


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
