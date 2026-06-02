-- 目标库: agent_platform
USE `agent_platform`;

-- 模块 06b — 只读库连接器元数据：初始化数据
--
-- 本模块无平台级初始化数据：
-- - 元数据行在管理台「抽取表结构」时按 connector_id 按需 upsert，不预置种子数据。
--
-- 保留空文件以符合 implementation-constraints §2.3（每模块至少输出 schema/seed/README）。
