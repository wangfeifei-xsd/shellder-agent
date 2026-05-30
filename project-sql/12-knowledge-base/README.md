# 12 — 知识库代理与知识库管理 SQL

## 作用（V1：pathy 代理）

平台 **不** 在库内存储 wiki 分块或向量；内容与召回由外部 `pathy-knowledge-server` 提供。

| 表名 | V1 用途 |
|------|---------|
| `knowledge_base` | **租户绑定元数据**：名称、状态、`pathy_wiki_prefix`（wiki 子路径前缀） |
| `kb_data_source` | **已废弃**（保留表结构，勿再写入） |
| `kb_document` | **已废弃** |
| `kb_chunk` | **已废弃**（原平台内 contains/向量占位） |
| `kb_embedding_task` | **已废弃** |

管理后台与运行时通过 `shellder-agent-server` 的 `/api/v1/knowledge/*` 代理 pathy；问答召回统一 `POST /api/v1/dialogue/recall`。

## 租户与 pathy 路径

- 默认 wiki 前缀：`tenants/{tenantId}/`（在代理层自动注入 `wiki_prefix` 与层内 `path`）
- 覆盖：在 `knowledge_base.pathy_wiki_prefix` 配置（每租户建议一条 `active` 绑定记录）
- pathy 需在 `DATA_ROOT` 下预先存在对应目录树（或单租户部署时将前缀设为空）

## 依赖前序模块

- `01-bootstrap`：Prisma 基线
- `02-tenant-management`：`tenant` 表

## 执行顺序

```bash
# 初版（若尚未执行）
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/schema.sql
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/seed.sql

# pathy 绑定字段增量
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/schema-pathy-binding.sql
```

或使用 Prisma：`pnpm --filter shellder-agent-server prisma:migrate`

## 废弃表处理策略

1. **不删表**：避免破坏已有迁移链与历史数据；新功能禁止写入 `kb_*` 子表。
2. **可选清理**：确认无生产数据后，可手工 `TRUNCATE` 或后续单独 migration `DROP TABLE`（需评审）。
3. **Prisma 模型**：暂保留以便兼容；代码侧 API 返回 `KNOWLEDGE_SELF_HOSTED_DEPRECATED`。

## 与 Prisma schema 的一致性

- `knowledge_base.pathy_wiki_prefix` ↔ `KnowledgeBase.pathyWikiPrefix`
- 迁移：`prisma/migrations/20260530120000_knowledge_pathy_binding`
