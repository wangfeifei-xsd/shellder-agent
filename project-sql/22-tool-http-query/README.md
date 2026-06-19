# 22-tool-http-query

Phase 2 增量：为 `tool.type` 增加 `http_query` 枚举值，用于 HTTP 业务查询工具（对标 agent-plant QueryTool）。

| 文件 | 说明 |
|------|------|
| `schema.sql` | `ALTER TABLE tool` 扩展 `type` ENUM |

与 `shellder-agent-server/prisma/schema.prisma` 中 `enum ToolType` 保持一致；`config.httpQuery` 结构见工具管理改造方案 §4.1。

**注意**：`ToolType.query`（数据库 NL2SQL）语义不变；HTTP 业务查询与智能问数分离。
