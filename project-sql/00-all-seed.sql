-- shellder-agent 全量种子数据
-- 目标库：agent_platform
-- 用法：先执行 00-all-schema.sql，再执行本文件
USE `agent_platform`;

-- 02-tenant-management

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

-- 03-user-rbac

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

INSERT INTO `agent_platform`.`user_role` (`user_id`, `role_id`)
SELECT u.`id`, r.`id`
FROM `user` u, `role` r
WHERE u.`username` = 'admin' AND r.`code` = 'super-admin'
ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`);

INSERT INTO `agent_platform`.`user_tenant` (`user_id`, `tenant_id`)
SELECT u.`id`, t.`id`
FROM `user` u, `tenant` t
WHERE u.`username` = 'admin' AND t.`code` = 'default'
ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`);

-- 10-capability-routing

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

-- 19-system-settings

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'basic', 'basic.platformName',    'shellder-agent',  '平台名称'),
  (UUID(), 'basic', 'basic.platformLogo',    '',                '平台 Logo URL'),
  (UUID(), 'basic', 'basic.defaultTimeoutMs','300000',          '默认超时（毫秒）'),
  (UUID(), 'basic', 'basic.defaultPageSize', '20',              '默认分页大小')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`);

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'model', 'model.streamEnabled',              'true',   '流式响应开关'),
  (UUID(), 'model', 'model.timeoutMs',                  '60000',  '模型调用默认超时（毫秒）'),
  (UUID(), 'model', 'model.retryCount',                 '3',      '模型调用默认重试次数'),
  (UUID(), 'model', 'model.retryDelayMs',               '1000',   '模型调用重试间隔（毫秒）'),
  (UUID(), 'model', 'model.capabilityResponseTemplate', '{}',     '能力级响应模板（JSON）')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`);

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'llm', 'llm.baseUrl',      '',                  'LLM Base URL（OpenAI 兼容）'),
  (UUID(), 'llm', 'llm.model',        '',                  'LLM 模型 ID'),
  (UUID(), 'llm', 'llm.timeoutMs',    '60000',             'LLM Chat 单次超时（毫秒）'),
  (UUID(), 'llm', 'llm.maxTokens',    '4096',              'LLM max_tokens'),
  (UUID(), 'llm', 'llm.apiKeyCipher', '',                  'LLM API Key（AES-GCM 加密）'),
  (UUID(), 'llm', 'llm.chatPath',     'chat/completions', 'Chat Completions 相对路径'),
  (UUID(), 'llm', 'llm.enableThinking', 'false', 'LLM 思考模式（enable_thinking）')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`);

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'notification', 'notification.connectorId', '', '消息通知连接器 ID（connector.type=notification）')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`);

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'knowledge', 'knowledge.wikiBaseUrl',   '',      'wiki 知识库服务 根 URL（知识库管理页配置，无尾斜杠）'),
  (UUID(), 'knowledge', 'knowledge.wikiTimeoutMs', '30000', 'wiki 代理 HTTP 超时（毫秒）')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`);

INSERT INTO `agent_platform`.`notification_template` (`id`, `type`, `name`, `subject`, `body`, `enabled`)
VALUES
  (UUID(), 'approval',      '默认审批通知模板',     '待审批：{{actionType}}',           '您有一条待确认的操作请求。\n操作类型：{{actionType}}\n发起人：{{initiatorName}}\n摘要：{{actionSummary}}\n请及时处理。', 1),
  (UUID(), 'task_complete',  '默认任务完成通知模板', '任务完成：{{taskTitle}}',           '任务「{{taskTitle}}」已完成。\n状态：{{taskStatus}}\n完成时间：{{completedAt}}', 1),
  (UUID(), 'exception',      '默认异常通知模板',     '异常告警：{{errorType}}',           '系统检测到异常。\n类型：{{errorType}}\n描述：{{errorMessage}}\n时间：{{occurredAt}}\n请及时排查。', 1)
ON DUPLICATE KEY UPDATE `body` = VALUES(`body`);

-- 21-prompt-management

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
  '你是只读 SQL 生成助手。根据数据库 ER 关系图与用户自然语言，生成单条 MySQL 只读查询。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown，不要额外说明。\n2. JSON 格式：\n{\n  \"sql\": \"SELECT ...\",\n  \"explanation\": \"面向用户的中文简要说明\",\n  \"referencedTables\": [\"表名1\", \"表名2\"],\n  \"params\": { \"paramName\": \"value\" },\n  \"extractedLiterals\": [\"实体名1\"]\n}\n3. sql 必须是单条 SELECT 或 WITH...SELECT，禁止 INSERT/UPDATE/DELETE/DDL。\n4. 只能使用输入 ER 图中出现的表；不得引用表黑名单中的表（若提供）。\n5. 命名参数使用 :name 形式，并在 params 中给出从用户问题提取的真实值；无参数时 params 为 {}。\n6. referencedTables 列出 SQL 实际引用的物理表名（小写无关，保持原表名）。\n7. extractedLiterals：从用户问题中识别出的具体实体名、筛选值（如人名、部门名、项目名等）。\n   - 纯聚合/统计类问题（如「一共有多少员工」「总共几个部门」）无具体实体名时，输出空数组 []。\n   - 仅提取用户明确提及的业务实体名，不要把疑问词、量词、语气词当作实体名。\n   - extractedLiterals 中的每个值都必须在 params 中有对应条目。',
  SHA2('query.nl2sql.system.v2', 256),
  '从 nl2sql.prompt.ts NL2SQL_SYSTEM_PROMPT 迁移; v2 增加 extractedLiterals',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000002' AND `version` = 1
);

-- v2：新增字段级硬约束（禁止使用 ER 图中不存在的字段，防字段幻觉）
INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0002-000000000002',
  '21000000-0000-0000-0000-000000000002',
  2,
  '你是只读 SQL 生成助手。根据数据库 ER 关系图与用户自然语言，生成单条 MySQL 只读查询。\n\n要求：\n1. 仅输出一个合法 JSON 对象，不要 markdown，不要额外说明。\n2. JSON 格式：\n{\n  \"sql\": \"SELECT ...\",\n  \"explanation\": \"面向用户的中文简要说明\",\n  \"referencedTables\": [\"表名1\", \"表名2\"],\n  \"params\": { \"paramName\": \"value\" },\n  \"extractedLiterals\": [\"实体名1\"]\n}\n3. sql 必须是单条 SELECT 或 WITH...SELECT，禁止 INSERT/UPDATE/DELETE/DDL。\n4. 只能使用输入 ER 图中出现的表；不得引用表黑名单中的表（若提供）。\n5. SQL 中引用的每个字段（含 SELECT、WHERE、JOIN ON、GROUP BY、ORDER BY 中的列）都必须真实存在于 ER 图对应表的 columns 列表中；严禁使用 ER 图未列出的字段，包括 is_deleted、deleted_at、status、enabled 等「常见但本库未必存在」的字段。若所需过滤字段在 ER 图中不存在，直接省略该过滤条件，不要编造字段。\n6. 命名参数使用 :name 形式，并在 params 中给出从用户问题提取的真实值；无参数时 params 为 {}。\n7. referencedTables 列出 SQL 实际引用的物理表名（小写无关，保持原表名）。\n8. extractedLiterals：从用户问题中识别出的具体实体名、筛选值（如人名、部门名、项目名等）。\n   - 纯聚合/统计类问题（如「一共有多少员工」「总共几个部门」）无具体实体名时，输出空数组 []。\n   - 仅提取用户明确提及的业务实体名，不要把疑问词、量词、语气词当作实体名。\n   - extractedLiterals 中的每个值都必须在 params 中有对应条目。',
  SHA2('query.nl2sql.system.v3', 256),
  'v2 新增字段级硬约束：SQL 仅可使用 ER 图 columns 中列出的字段（防字段幻觉）',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000002' AND `version` = 2
);

UPDATE `agent_platform`.`prompt_version`
SET `state` = 'deprecated'
WHERE `template_id` = '21000000-0000-0000-0000-000000000002'
  AND `version` = 1 AND `state` = 'published';

INSERT INTO `agent_platform`.`prompt_template`
  (`id`, `prompt_key`, `name`, `description`, `category`, `role`, `scope`, `tenant_id`, `variable_schema`, `status`, `created_at`, `updated_at`)
VALUES (
  '21000000-0000-0000-0000-000000000003',
  'query.nl2sql.user',
  'NL2SQL User',
  'ER + 数据范围 + 黑名单 + 用户问题骨架',
  'query', 'user', 'global', NULL,
  JSON_OBJECT('required', JSON_ARRAY('erContext', 'scopeContextBlock', 'tableBlacklistLine', 'fieldBlacklistLine', 'maxRows', 'userMessage', 'fewShotBlock')),
  'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `agent_platform`.`prompt_version`
  (`id`, `template_id`, `version`, `content`, `content_hash`, `changelog`, `state`, `published_at`, `published_by`, `created_at`)
SELECT
  '21000000-0000-0000-0001-000000000003',
  '21000000-0000-0000-0000-000000000003',
  1,
  '## ER 关系图（已裁剪）\n{{erContext}}\n\n{{scopeContextBlock}}## Tool 约束\n{{tableBlacklistLine}}\n{{fieldBlacklistLine}}\n- 建议最大返回行数：{{maxRows}}\n## 用户问题\n{{userMessage}}\n\n{{fewShotBlock}}请生成 JSON。',
  SHA2('query.nl2sql.user.v1', 256),
  'NL2SQL user prompt',
  'published', CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `agent_platform`.`prompt_version`
  WHERE `template_id` = '21000000-0000-0000-0000-000000000003' AND `version` = 1
);

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

