-- =============================================================================
-- shellder-agent 全量预制数据脚本（由 project-sql 各模块 seed.sql 自动合并）
-- 生成：./merge-all-sql.sh
-- 目标库：agent_platform（见 db-name.cnf）
-- 顺序：模块 01 → 20
-- 用法：先 00-all-schema.sql（或 prisma migrate），再本文件
--       mysql -h HOST -u USER -p < 00-all-seed.sql
-- =============================================================================
-- 目标库: agent_platform
USE `agent_platform`;

-- -----------------------------------------------------------------------------
-- 来源: 01-bootstrap/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 01 — 无基础种子数据
-- （租户、用户等种子数据在对应模块交付）

-- -----------------------------------------------------------------------------
-- 来源: 02-tenant-management/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 02 — 租户管理 种子数据
-- 提供一个默认演示租户，便于后续模块（用户、连接器、工具等）在本地选择已存在且 enabled 的 tenant.id。
-- 幂等：按 code 唯一键 upsert；id 固定，方便跨环境引用。

INSERT INTO `agent_platform`.`tenant`
    (`id`, `code`, `name`, `status`, `external_tenant_id`, `config`, `admin_user_id`, `remark`, `created_at`, `updated_at`)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    '默认租户',
    'enabled',
    NULL,
    JSON_OBJECT(
        'capabilities', JSON_ARRAY('qa', 'query', 'action', 'workflow'),
        'limits', JSON_OBJECT('maxSessions', 0, 'maxTasks', 0),
        'isolation', JSON_OBJECT(
            'dataIsolationStrategy', 'strict',
            'restrictCrossTenant', true,
            'connectorVisibleWithinTenant', true,
            'toolVisibleWithinTenant', true,
            'auditVisibleWithinTenant', true
        )
    ),
    NULL,
    '平台初始化默认租户（可禁用，勿删除引用中的 id）',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `updated_at` = CURRENT_TIMESTAMP(3);

-- -----------------------------------------------------------------------------
-- 来源: 03-user-rbac/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 03 — 用户与权限 种子数据
-- 提供内置「超级管理员」角色与默认管理员账号，并绑定 02 模块的默认租户。
-- 幂等：role 按 code、user 按 username upsert；关联表先删后插，固定 id 便于跨环境引用。
--
-- 默认账号：admin / admin123（password_hash 为 bcrypt，cost=10）。请首次登录后尽快修改密码。
-- 注：shellder-agent-server 启动时也会自动幂等创建该管理员（可用 AUTH_BOOTSTRAP=false 关闭）。

-- 1) 超级管理员角色（menus=["*"] 表示全部菜单；policy 含四类能力 + 高风险审批）
INSERT INTO `agent_platform`.`role`
    (`id`, `code`, `name`, `description`, `menus`, `modules`, `tool_scopes`, `policy`, `is_system`, `created_at`, `updated_at`)
VALUES (
    '00000000-0000-0000-0000-0000000000a1',
    'super-admin',
    '超级管理员',
    '系统内置角色，拥有全部菜单、模块与能力权限',
    JSON_ARRAY('*'),
    JSON_ARRAY(
        'tenant.manage', 'user.manage', 'role.manage', 'policy.manage', 'audit.view',
        'connector.manage', 'tool.manage', 'session.manage', 'task.manage',
        'approval.handle', 'settings.manage',
        'prompt:read', 'prompt:write', 'prompt:publish', 'prompt:debug'
    ),
    JSON_ARRAY('*'),
    JSON_OBJECT(
        'capabilities', JSON_ARRAY('qa', 'query', 'action', 'workflow'),
        'canApproveHighRisk', true
    ),
    true,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `is_system` = true,
    `updated_at` = CURRENT_TIMESTAMP(3);

-- 2) 默认管理员账号（bcrypt('admin123')）
INSERT INTO `agent_platform`.`user`
    (`id`, `username`, `password_hash`, `display_name`, `email`, `status`, `is_system`, `remark`, `created_at`, `updated_at`)
VALUES (
    '00000000-0000-0000-0000-0000000000u1',
    'admin',
    '$2a$10$dubTdiqQmOpUp.gqBL1Tc.4YrBAjI8S2XL4/ccYGpP1exRmywL4he',
    '平台管理员',
    NULL,
    'enabled',
    true,
    '平台初始化默认管理员（请尽快修改密码）',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `display_name` = VALUES(`display_name`),
    `is_system` = true,
    `updated_at` = CURRENT_TIMESTAMP(3);

-- 3) 绑定管理员角色
INSERT INTO `agent_platform`.`user_role` (`user_id`, `role_id`)
SELECT u.`id`, r.`id`
FROM `user` u, `role` r
WHERE u.`username` = 'admin' AND r.`code` = 'super-admin'
ON DUPLICATE KEY UPDATE `agent_platform`.`user_id` = `user_role`.`user_id`;

-- 4) 绑定默认租户（来自 02-tenant-management/seed.sql，code='default'）
INSERT INTO `agent_platform`.`user_tenant` (`user_id`, `tenant_id`)
SELECT u.`id`, t.`id`
FROM `user` u, `tenant` t
WHERE u.`username` = 'admin' AND t.`code` = 'default'
ON DUPLICATE KEY UPDATE `agent_platform`.`user_id` = `user_tenant`.`user_id`;

-- -----------------------------------------------------------------------------
-- 来源: 04-audit-center/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 04 — 审计模块与审计中心 / seed
--
-- 本模块无基础初始化数据：
-- - 审计记录由运行期采集（用户操作审计自动写入；工具调用 07 起、外部接口 06/13 起写入）。
-- - 风险动作审计为聚合只读视图，无需预置数据。
--
-- 因此本文件保留为空，仅作占位与说明（实施约束 §2.3）。

-- -----------------------------------------------------------------------------
-- 来源: 05-policy-engine/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 05 — 策略引擎与规则配置 / seed
--
-- 本模块无平台级基础初始化数据：
-- - 规则（rule）为按租户的显式配置，由运营在「规则配置」页按需创建，
--   随租户接入而定，不预置演示性脏数据（实施约束 §2.2 / §2.3）。
-- - 规则命中记录（rule_hit）由运行期 Policy 评估自动写入，无需预置。
--
-- 参考：可在管理后台「规则配置」新建一条「高风险需确认」规则用于验证（验收标准 1），
-- 等价 SQL 示例（请将 <TENANT_ID> 替换为真实租户，按需执行；非交付数据）：
--
-- INSERT INTO `agent_platform`.`rule`
--   (`id`, `tenant_id`, `name`, `type`, `conditions`, `action`, `priority`, `status`, `description`, `updated_at`)
-- VALUES
--   (UUID(), '<TENANT_ID>', '高风险动作需确认', 'confirm',
--    JSON_OBJECT('match', 'any', 'riskLevels', JSON_ARRAY('high')),
--    'need_confirm', 10, 'enabled', '命中高风险等级的请求需人工确认', NOW(3));
--
-- 因此本文件保留为空，仅作占位与说明。

-- -----------------------------------------------------------------------------
-- 来源: 06-connector-management/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 06 — 连接器管理：初始化数据
--
-- 本模块无平台级初始化数据：
-- - 连接器均为各租户在运行期按需配置（含目标系统、认证凭证），不预置演示数据。
-- - 连接器菜单权限（connector）与模块权限（connector.manage）已在 03-user-rbac
--   的权限目录中预置，无需在此追加。
--
-- 保留空文件以符合 implementation-constraints §2.3（每模块至少输出 schema/seed/README）。

-- -----------------------------------------------------------------------------
-- 来源: 07-tool-registry/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 07 — 工具注册与工具管理：初始化数据
--
-- 本模块无平台级初始化数据：
-- - Tool 均为各租户在运行期按需注册（含入参 / 出参 Schema、连接器绑定、SQL 约束），不预置演示数据
--   （执行计划 / 架构 §9：各租户 Query/Action/Workflow Tool 由项目接入时配置，不阻塞平台基线）。
-- - 工具菜单权限（tool）与模块权限（tool.manage）已在 03-user-rbac 的权限目录中预置，无需在此追加。
--
-- 保留空文件以符合 implementation-constraints §2.3（每模块至少输出 schema/seed/README）。

-- -----------------------------------------------------------------------------
-- 来源: 08-session-message/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 08 — 会话与消息核心 — 初始化数据
-- ================================================================
-- 本模块无需初始化数据。
-- Session 与 Message 均为运行时数据，由 API 调用创建。
-- 保留空文件以满足模块交付规范。

-- -----------------------------------------------------------------------------
-- 来源: 09-task-worker/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 09 — 任务中心与异步 Worker — 初始化数据
-- 本模块无必需的基础初始化数据。
-- 任务、步骤、日志均由运行时动态创建。
-- ================================================================

-- （无初始化数据）

-- -----------------------------------------------------------------------------
-- 来源: 10-capability-routing/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 10 — 能力路由 Seed Data
-- 初始化四类基础能力模板（仅供演示/测试；正式环境由租户自行配置）
-- 注意：此处不插入真实数据，因为能力按租户隔离，需要先有租户才能创建能力。
-- 如需测试，可在已有租户下手动执行以下示例 SQL。
-- ================================================================

-- 默认租户（02-seed id 固定）四类基础能力 — 与 CapabilityService.ensureDefaultCapabilities 一致
INSERT INTO `agent_platform`.`capability`
  (`id`, `tenant_id`, `type`, `name`, `description`, `applicable_system`, `dependent_tools`, `permission_requirements`, `priority`, `status`, `created_at`, `updated_at`)
VALUES
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'qa',       '通用问答', '基于知识库的问答能力',   '全平台',   '[]', '[]', 10, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('a1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'query',    '数据查询', 'SQL 只读查询能力',      '数据分析', '[]', '[]', 20, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('a1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000001', 'action',   '业务操作', 'HTTP API 写操作能力',   '业务系统', '[]', '[]', 30, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('a1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000001', 'workflow', '流程编排', '多步骤任务编排能力',     '运营系统', '[]', '[]', 40, 'enabled', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = CURRENT_TIMESTAMP(3);

-- -----------------------------------------------------------------------------
-- 来源: 11-skill-management/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 11 — 技能书管理 — 种子数据
-- ================================================================
-- 技能书为配置类业务对象，由运营人员按接入业务场景创建。
-- V1 不预置固定技能书，seed 数据为空。
-- 具体业务技能书配置由项目接入时通过管理后台「新建技能书」注入。
-- ================================================================

-- -----------------------------------------------------------------------------
-- 来源: 12-knowledge-base/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 11A — 知识库代理与知识库管理 — 种子数据
-- ================================================================
-- 知识库为配置类业务对象，由运营人员按接入业务场景创建。
-- V1 不预置固定知识库，seed 数据为空。
-- 具体知识库配置由项目接入时通过管理后台「新建知识库」注入。
-- ================================================================

-- -----------------------------------------------------------------------------
-- 来源: 13-agent-runtime/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 12 — Agent 运行时与流式响应 — 初始化数据
-- ================================================================
-- 本阶段无需初始化数据。
-- Agent Runtime 为运行时编排模块，不预置业务配置数据。

-- -----------------------------------------------------------------------------
-- 来源: 14-business-capabilities/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 13 — 四类业务能力 · 初始化数据
-- ================================================================
--
-- 本阶段无需初始化数据。
--
-- 四类能力由运行时编排驱动，不依赖预置种子数据。
-- 具体 Tool / 连接器 / 知识库 / 路由规则由接入项目按租户配置。
--
-- 验收标准中的端到端演示路径可通过以下前序数据组合实现：
-- 1. 问答型：已配置知识库（12）+ 启用的 qa 能力（10）
-- 2. 查询型：已注册 query Tool（07）+ db_readonly 连接器（06）+ 路由规则（10）
-- 3. 操作型：已注册 action/notification Tool（07）+ http 连接器（06）+ 路由规则（10）
-- 4. 流程型：已注册 workflow Tool（07，含 steps 配置）+ 路由规则（10）

-- -----------------------------------------------------------------------------
-- 来源: 15-approval-center/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 14 — 审批中心 种子数据
-- 本模块无初始化种子数据；审批记录由 Agent Runtime 运行时创建。
-- ================================================================

-- -----------------------------------------------------------------------------
-- 来源: 16-openapi/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ───────────────────────────────────────────────────────────
-- 阶段 15 / SQL 目录 16 — OpenAPI 对外接口与管理 — 初始化数据
-- 本模块无必需的基础初始化数据。
-- 接入应用通过管理后台「OpenAPI 管理 > 应用接入」在线创建。
-- ───────────────────────────────────────────────────────────

-- 无初始化数据

-- -----------------------------------------------------------------------------
-- 来源: 17-session-debug-console/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 16 — 会话管理与调试台 — 基础初始化数据
-- ================================================================
--
-- 本阶段无初始化数据需求。
-- 调试会话由管理后台调试台页面在运行时动态创建。
-- 会话与消息数据通过 08-session-message / 12-agent-runtime 生成。
-- ================================================================

-- -----------------------------------------------------------------------------
-- 来源: 18-workbench/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 17 — 工作台 seed.sql
-- ================================================================
--
-- 本模块为纯聚合读取模块，不需要初始化数据。
-- 工作台所展示的数据来自前序模块已有表的聚合查询：
--   - tool_call_audit（阶段 04）
--   - approval（阶段 14）
--   - task（阶段 09）
--
-- 无初始化数据。
-- ================================================================

-- -----------------------------------------------------------------------------
-- 来源: 19-system-settings/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ============================================================
-- 阶段 18 — 系统设置 — 初始化数据
-- 平台默认配置项（基础配置 + 模型与响应配置 + 通知配置）
-- 默认通知模板（审批通知 / 任务完成通知 / 异常通知）
-- ============================================================

-- ── 基础配置 ──────────────────────────────────────────────

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'basic', 'basic.platformName',    'shellder-agent',  '平台名称'),
  (UUID(), 'basic', 'basic.platformLogo',    '',                '平台 Logo URL'),
  (UUID(), 'basic', 'basic.defaultTimeoutMs','300000',          '默认超时（毫秒）'),
  (UUID(), 'basic', 'basic.defaultPageSize', '20',              '默认分页大小')
ON DUPLICATE KEY UPDATE `agent_platform`.`config_value` = VALUES(`config_value`);

-- ── 模型与响应配置 ────────────────────────────────────────

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'model', 'model.streamEnabled',              'true',   '流式响应开关'),
  (UUID(), 'model', 'model.timeoutMs',                  '60000',  '模型调用默认超时（毫秒）'),
  (UUID(), 'model', 'model.retryCount',                 '3',      '模型调用默认重试次数'),
  (UUID(), 'model', 'model.retryDelayMs',               '1000',   '模型调用重试间隔（毫秒）'),
  (UUID(), 'model', 'model.capabilityResponseTemplate', '{}',     '能力级响应模板（JSON）')
ON DUPLICATE KEY UPDATE `agent_platform`.`config_value` = VALUES(`config_value`);

-- ── 模型接入（OpenAI 兼容，实施规格 §4）────────────────────

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'llm', 'llm.baseUrl',      '',                  'LLM Base URL（OpenAI 兼容）'),
  (UUID(), 'llm', 'llm.model',        '',                  'LLM 模型 ID'),
  (UUID(), 'llm', 'llm.timeoutMs',    '60000',             'LLM Chat 单次超时（毫秒）'),
  (UUID(), 'llm', 'llm.maxTokens',    '4096',              'LLM max_tokens'),
  (UUID(), 'llm', 'llm.apiKeyCipher', '',                  'LLM API Key（AES-GCM 加密）'),
  (UUID(), 'llm', 'llm.chatPath',     'chat/completions', 'Chat Completions 相对路径'),
  (UUID(), 'llm', 'llm.enableThinking', 'false', 'LLM 思考模式（enable_thinking）')
ON DUPLICATE KEY UPDATE `agent_platform`.`config_value` = VALUES(`config_value`);

-- ── 通知配置 ──────────────────────────────────────────────

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'notification', 'notification.connectorId', '', '消息通知连接器 ID（connector.type=notification）')
ON DUPLICATE KEY UPDATE `agent_platform`.`config_value` = VALUES(`config_value`);

-- ── 知识库 wiki 连接（原 WIKI_KNOWLEDGE_SERVER_* 环境变量，现落库）──

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'knowledge', 'knowledge.wikiBaseUrl',   '',      'wiki 知识库服务 根 URL（知识库管理页配置，无尾斜杠）'),
  (UUID(), 'knowledge', 'knowledge.wikiTimeoutMs', '30000', 'wiki 代理 HTTP 超时（毫秒）')
ON DUPLICATE KEY UPDATE `agent_platform`.`config_value` = VALUES(`config_value`);

-- ── 默认通知模板 ──────────────────────────────────────────

INSERT INTO `agent_platform`.`notification_template` (`id`, `type`, `name`, `subject`, `body`, `enabled`)
VALUES
  (UUID(), 'approval',      '默认审批通知模板',     '待审批：{{actionType}}',           '您有一条待确认的操作请求。\n操作类型：{{actionType}}\n发起人：{{initiatorName}}\n摘要：{{actionSummary}}\n请及时处理。', 1),
  (UUID(), 'task_complete',  '默认任务完成通知模板', '任务完成：{{taskTitle}}',           '任务「{{taskTitle}}」已完成。\n状态：{{taskStatus}}\n完成时间：{{completedAt}}', 1),
  (UUID(), 'exception',      '默认异常通知模板',     '异常告警：{{errorType}}',           '系统检测到异常。\n类型：{{errorType}}\n描述：{{errorMessage}}\n时间：{{occurredAt}}\n请及时排查。', 1)
ON DUPLICATE KEY UPDATE `agent_platform`.`body` = VALUES(`body`);

-- -----------------------------------------------------------------------------
-- 来源: 20-embedded-copilot/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- ================================================================
-- 阶段 19 — 嵌入式 Copilot / seed.sql
-- 无必需基础初始化数据。
-- Copilot 配置由管理后台创建，与具体租户和 OpenAPI 应用绑定。
-- ================================================================
-- 本模块无需 seed 数据。

-- -----------------------------------------------------------------------------
-- 来源: 21-prompt-management/seed.sql
-- -----------------------------------------------------------------------------
-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 21 — Prompt 管理种子数据
-- 八个 V1 prompt_key，各含 published version=1（正文自现有代码迁移）
-- 幂等：按 prompt_key + scope 定位 template；version 1 published 仅首次插入

-- ── qa.dialogue.system ────────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000001',
  'qa.dialogue.system',
  '问答生成 System',
  '问答型 recall 后生成阶段 system 模板',
  'qa', 'system', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('citationLines', 'contextBlock')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000001',
  '21000000-0000-0000-0000-000000000001',
  1,
  '你是 shellder-agent 平台的问答助手。请基于下方「知识库召回结果」回答用户问题。\n- 优先使用注入上下文与引用片段中的事实；不要编造未出现的信息。\n- 若知识库无相关内容，礼貌说明未找到相关信息，并建议用户换种问法或联系管理员。\n- 回答末尾可简要列出引用来源编号。\n\n## 召回引用\n{{citationLines}}{{contextBlock}}',
  SHA2('qa.dialogue.system.v1', 256),
  '从 QaPipelineService.composeSystemPrompt 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000001' AND `version` = 1
);

-- ── query.nl2sql.system ───────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000002',
  'query.nl2sql.system',
  'NL2SQL System',
  'NL2SQL 约束与 JSON 输出格式',
  'query', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000002',
  '21000000-0000-0000-0000-000000000002',
  1,
  '你是只读 SQL 生成助手。根据数据库 ER 关系图与用户自然语言，生成单条 MySQL 只读查询。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown，不要额外说明。\n2. JSON 格式：\n{\n  \"sql\": \"SELECT ...\",\n  \"explanation\": \"面向用户的中文简要说明\",\n  \"referencedTables\": [\"表名1\", \"表名2\"],\n  \"params\": { \"paramName\": \"value\" }\n}\n3. sql 必须是单条 SELECT 或 WITH...SELECT，禁止 INSERT/UPDATE/DELETE/DDL。\n4. 只能使用输入 ER 图中出现的表；不得引用表黑名单中的表（若提供）。\n5. 命名参数使用 :name 形式，并在 params 中给出示例值；无参数时 params 为 {}。\n6. referencedTables 列出 SQL 实际引用的物理表名（小写无关，保持原表名）。',
  SHA2('query.nl2sql.system.v1', 256),
  '从 nl2sql.prompt.ts NL2SQL_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000002' AND `version` = 1
);

-- ── query.nl2sql.user ─────────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000003',
  'query.nl2sql.user',
  'NL2SQL User',
  'ER + 黑名单 + 用户问题骨架',
  'query', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('erContext', 'tableBlacklistLine', 'fieldBlacklistLine', 'maxRows', 'userMessage', 'fewShotBlock')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000003',
  '21000000-0000-0000-0000-000000000003',
  1,
  '## ER 关系图（已裁剪）\n{{erContext}}\n\n## Tool 约束\n{{tableBlacklistLine}}\n{{fieldBlacklistLine}}\n- 建议最大返回行数：{{maxRows}}\n## 用户问题\n{{userMessage}}\n\n{{fewShotBlock}}请生成 JSON。',
  SHA2('query.nl2sql.user.v1', 256),
  '从 buildNl2SqlUserPrompt 骨架迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000003' AND `version` = 1
);

-- ── query.result.system ───────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000004',
  'query.result.system',
  '查询结果解读 System',
  '查询结果自然语言解读',
  'query', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000004',
  '21000000-0000-0000-0000-000000000004',
  1,
  '你是业务数据查询助手。根据用户的提问与数据库查询结果，用简洁、准确的中文给出回答。\n\n要求：\n1. 仅依据查询结果中的数据作答，不得编造结果中不存在的字段或数值。\n2. 若结果为空（rowCount=0），说明未查到符合条件的数据，可简要提示可能原因。\n3. 若结果被截断（truncated=true），明确告知「共 N 条，以下基于前 M 条作答」。\n4. 聚合或单值结果用自然语言表述；明细较多时可概括要点，必要时用简短列表。\n5. 直接回答用户问题，不要复述 SQL，不要输出 JSON。\n6. 语气专业、友好，面向业务用户而非技术人员。',
  SHA2('query.result.system.v1', 256),
  '从 query-result.prompt.ts QUERY_RESULT_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000004' AND `version` = 1
);

-- ── query.result.user ─────────────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000005',
  'query.result.user',
  '查询结果解读 User',
  '问题 + 结果 JSON 骨架',
  'query', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessage', 'rowCount', 'columnsLine', 'truncatedLine', 'rowsJson')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000005',
  '21000000-0000-0000-0000-000000000005',
  1,
  '## 用户问题\n{{userMessage}}\n\n## 查询结果元信息\n- 总行数：{{rowCount}}\n- 列：{{columnsLine}}\n{{truncatedLine}}## 查询结果数据（JSON）\n{{rowsJson}}\n\n请根据以上数据回答用户问题。',
  SHA2('query.result.user.v1', 256),
  '从 buildQueryResultUserPrompt 骨架迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000005' AND `version` = 1
);

-- ── connector.er_diagram.system ───────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000006',
  'connector.er_diagram.system',
  'ER 构图 System',
  '初版 ER 关系图生成',
  'sql_conversion', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000006',
  '21000000-0000-0000-0000-000000000006',
  1,
  '你是资深 DBA 助手。根据给定的数据库表结构摘要 JSON，推断表间关系并输出 ER 关系图。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown 代码块，不要额外说明。\n2. JSON 结构必须为（不要输出 columns，列信息由系统从抽取结果补全）：\n{\n  \"tables\": [\n    { \"name\": \"物理表名\", \"displayName\": \"中文或业务显示名（可用表注释）\" }\n  ],\n  \"relationships\": [\n    {\n      \"id\": \"rel_唯一id\",\n      \"from\": \"源表名\",\n      \"to\": \"目标表名\",\n      \"fromColumns\": [\"源列\"],\n      \"toColumns\": [\"目标列\"],\n      \"cardinality\": \"1:1|1:N|N:1|N:M\",\n      \"inferred\": true/false\n    }\n  ]\n}\n3. tables 必须覆盖输入中的每一张物理表（仅 name + displayName），禁止臆造表名。\n4. 有外键时 inferred 为 false；仅凭列名模式推断时 inferred 为 true。\n5. cardinality 使用 N:1 表示多对一（from 多 to 一）。',
  SHA2('connector.er_diagram.system.v1', 256),
  '从 er-diagram.prompt.ts ER_DIAGRAM_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000006' AND `version` = 1
);

-- ── connector.er_diagram.refine.system ────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000007',
  'connector.er_diagram.refine.system',
  'ER 构图优化 System',
  '基于 draft 辅助优化 ER',
  'sql_conversion', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000007',
  '21000000-0000-0000-0000-000000000007',
  1,
  CONCAT(
    '你是资深 DBA 助手。根据给定的数据库表结构摘要 JSON，推断表间关系并输出 ER 关系图。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown 代码块，不要额外说明。\n2. JSON 结构必须为（不要输出 columns，列信息由系统从抽取结果补全）：\n{\n  \"tables\": [\n    { \"name\": \"物理表名\", \"displayName\": \"中文或业务显示名（可用表注释）\" }\n  ],\n  \"relationships\": [\n    {\n      \"id\": \"rel_唯一id\",\n      \"from\": \"源表名\",\n      \"to\": \"目标表名\",\n      \"fromColumns\": [\"源列\"],\n      \"toColumns\": [\"目标列\"],\n      \"cardinality\": \"1:1|1:N|N:1|N:M\",\n      \"inferred\": true/false\n    }\n  ]\n}\n3. tables 必须覆盖输入中的每一张物理表（仅 name + displayName），禁止臆造表名。\n4. 有外键时 inferred 为 false；仅凭列名模式推断时 inferred 为 true。\n5. cardinality 使用 N:1 表示多对一（from 多 to 一）。\n\n补充（在已有 er_draft 基础上辅助优化时）：\n6. 输入含 current_er_draft 时，在其基础上查漏补缺、修正 displayName 与 relationships，不要推倒重来。\n7. 用户已确认的关系（inferred=false）若结构未变，必须保持 inferred=false。\n8. 可新增缺失关系、修正错误基数或列映射；不要删除 current_er_draft 中合理且与 schema 一致的关系，除非与 schema 外键明显矛盾。'
  ),
  SHA2('connector.er_diagram.refine.system.v1', 256),
  '从 ER_DIAGRAM_REFINE_SYSTEM_PROMPT 迁移',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000007' AND `version` = 1
);

-- ── connector.er_diagram.user ─────────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000008',
  'connector.er_diagram.user',
  'ER 构图 User',
  'schema + 可选 current_er_draft 骨架',
  'sql_conversion', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessageBody')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000008',
  '21000000-0000-0000-0000-000000000008',
  1,
  '{{userMessageBody}}',
  SHA2('connector.er_diagram.user.v1', 256),
  'user 正文由代码组装 userMessageBody（初版/优化）后注入',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000008' AND `version` = 1
);

-- ── connector.er_data_scope.system ────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000009',
  'connector.er_data_scope.system',
  'ER 限制字段 System',
  '分析各表 scopeColumn / userColumn',
  'sql_conversion', 'system', 'global', NULL, NULL,
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000009',
  '21000000-0000-0000-0000-000000000009',
  1,
  '你是数据库治理助手。为每张物理表配置「嵌入入参 → 表内物理列」映射：\n- scopeColumn：本表真实列名，运行期 scopeList 对此列 IN（如 cust_id、dept_id）\n- userColumn：本表真实列名，运行期 externalUserId 对此列 =（如 creator_id、owner_user_id）\n禁止把 scopeList、externalUserId 等参数名写入列字段；必须来自该表 columns。无合适列可省略。只输出 JSON。',
  SHA2('connector.er_data_scope.system.v2', 256),
  '问数数据范围配置期 LLM',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000009' AND `version` = 1
);

-- ── connector.er_data_scope.user ──────────────────────────────
INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000010',
  'connector.er_data_scope.user',
  'ER 限制字段 User',
  'schema + 表列表骨架',
  'sql_conversion', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('userMessageBody')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000010',
  '21000000-0000-0000-0000-000000000010',
  1,
  '{{userMessageBody}}',
  SHA2('connector.er_data_scope.user.v1', 256),
  '正文由 er-data-scope.variables 组装',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000010' AND `version` = 1
);

-- ── query.nl2sql.user v2：scopeContextBlock ───────────────────
INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0002-000000000003',
  '21000000-0000-0000-0000-000000000003',
  2,
  '## ER 关系图（已裁剪）\n{{erContext}}\n\n{{scopeContextBlock}}## Tool 约束\n{{tableBlacklistLine}}\n{{fieldBlacklistLine}}\n- 建议最大返回行数：{{maxRows}}\n## 用户问题\n{{userMessage}}\n\n{{fewShotBlock}}请生成 JSON。',
  SHA2('query.nl2sql.user.v2', 256),
  '增加 scopeContextBlock（问数数据范围）',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000003' AND `version` = 2
);

UPDATE `agent_platform`.`prompt_template`
SET `variable_schema` = JSON_OBJECT(
  'required',
  JSON_ARRAY('erContext', 'tableBlacklistLine', 'fieldBlacklistLine', 'maxRows', 'userMessage', 'fewShotBlock', 'scopeContextBlock')
),
`updated_at` = CURRENT_TIMESTAMP(3)
WHERE `prompt_key` = 'query.nl2sql.user';

-- RBAC：为超级管理员追加 prompt 模块权限（菜单 * 已含 prompt）
UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:read'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:read"');

UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:write'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:write"');

UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:publish'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:publish"');

UPDATE `agent_platform`.`role`
SET `modules` = JSON_ARRAY_APPEND(COALESCE(`modules`, JSON_ARRAY()), '$', 'prompt:debug'), `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'super-admin' AND NOT JSON_CONTAINS(COALESCE(`modules`, JSON_ARRAY()), '"prompt:debug"');


