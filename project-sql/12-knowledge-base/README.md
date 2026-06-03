# 12 — 知识库代理与知识库管理 SQL

## 作用（V1：wiki 代理）

平台 **不** 在库内存储 wiki 分块或向量；内容与召回由外部 `wiki 知识库服务` 提供。

| 表名 | V1 用途 |
|------|---------|
| `knowledge_base` | **租户绑定元数据**：名称、状态、`wiki_prefix`（wiki 子路径前缀） |
| `kb_layer_processing_job` | wiki 层文件异步处理任务（Prisma 已有，project-sql 增量待补齐） |

**已从 project-sql 移除（自建向量路径废弃，Prisma 历史 migration 仍保留建表语句供旧库兼容）：**

| 表名 | 说明 |
|------|------|
| `kb_data_source` | 已废弃，勿再写入 |
| `kb_document` | 已废弃 |
| `kb_chunk` | 已废弃（原平台内 contains/向量占位） |
| `kb_embedding_task` | 已废弃 |

管理后台与运行时通过 `shellder-agent-server` 的 `/api/v1/knowledge/*` 代理 wiki；问答召回统一 `POST /api/v1/dialogue/recall`。

## 租户与 wiki 路径

- 默认 wiki 前缀：`tenants/{tenantId}/`（在代理层自动注入 `wiki_prefix` 与层内 `path`）
- 覆盖：在 `knowledge_base.wiki_prefix` 配置（每租户建议一条 `active` 绑定记录）
- wiki 需在 `DATA_ROOT` 下预先存在对应目录树（或单租户部署时将前缀设为空）

## 依赖前序模块

- `01-bootstrap`：Prisma 基线
- `02-tenant-management`：`tenant` 表

## 执行顺序

```bash
# 初版（若尚未执行）
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/schema.sql
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/seed.sql

# wiki 绑定字段增量
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/schema-pathy-binding.sql

# wiki 服务地址（system_config，非环境变量）
mysql -u root -p shellder_agent < project-sql/19-system-settings/seed-knowledge-wiki-config.sql
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/migrate-pathy-wiki-prefix-column.sql
```

wiki 根 URL 存于 `system_config`（`knowledge.wikiBaseUrl`），在 **知识库管理** 页面维护；默认 seed 中 `wikiBaseUrl` 为空，需部署后填写。

或使用 Prisma：`pnpm --filter shellder-agent-server prisma:migrate`

## 废弃表处理策略

1. **project-sql 不交付**：`kb_data_source` / `kb_document` / `kb_chunk` / `kb_embedding_task` 已从 `schema.sql` 移除；新库若走 SQL 全量脚本不再创建上述表。
2. **Prisma 历史 migration 保留**：避免破坏已有迁移链；旧库若已存在上述表，可手工 `TRUNCATE` 或后续单独 migration `DROP TABLE`（需评审）。
3. **Prisma 模型暂保留**：代码侧废弃 API 返回 `KNOWLEDGE_SELF_HOSTED_DEPRECATED`。

## 与 Prisma schema 的一致性

- `knowledge_base.wiki_prefix` ↔ `KnowledgeBase.wikiPrefix`
- 迁移：`prisma/migrations/20260530120000_knowledge_pathy_binding`
