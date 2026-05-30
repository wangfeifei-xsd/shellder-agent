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

-- ── 通知配置 ──────────────────────────────────────────────

INSERT INTO `agent_platform`.`system_config` (`id`, `config_group`, `config_key`, `config_value`, `description`)
VALUES
  (UUID(), 'notification', 'notification.connectorId', '', '消息通知连接器 ID（connector.type=notification）')
ON DUPLICATE KEY UPDATE `agent_platform`.`config_value` = VALUES(`config_value`);

-- ── 默认通知模板 ──────────────────────────────────────────

INSERT INTO `agent_platform`.`notification_template` (`id`, `type`, `name`, `subject`, `body`, `enabled`)
VALUES
  (UUID(), 'approval',      '默认审批通知模板',     '待审批：{{actionType}}',           '您有一条待确认的操作请求。\n操作类型：{{actionType}}\n发起人：{{initiatorName}}\n摘要：{{actionSummary}}\n请及时处理。', 1),
  (UUID(), 'task_complete',  '默认任务完成通知模板', '任务完成：{{taskTitle}}',           '任务「{{taskTitle}}」已完成。\n状态：{{taskStatus}}\n完成时间：{{completedAt}}', 1),
  (UUID(), 'exception',      '默认异常通知模板',     '异常告警：{{errorType}}',           '系统检测到异常。\n类型：{{errorType}}\n描述：{{errorMessage}}\n时间：{{occurredAt}}\n请及时排查。', 1)
ON DUPLICATE KEY UPDATE `agent_platform`.`body` = VALUES(`body`);