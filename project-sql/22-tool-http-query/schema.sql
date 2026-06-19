USE `agent_platform`;

-- Phase 2：HTTP 业务查询工具类型（对标 agent-plant QueryTool）
-- 与 shellder-agent-server/prisma/schema.prisma ToolType.http_query 对齐
ALTER TABLE `agent_platform`.`tool`
  MODIFY COLUMN `type` ENUM(
    'query',
    'action',
    'workflow',
    'notification',
    'http_query'
  ) NOT NULL COMMENT '类型：查询型 / 操作型 / 流程型 / 通知型 / HTTP业务查询';
