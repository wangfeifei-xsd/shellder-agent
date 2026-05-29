# 12 — 知识库代理与知识库管理 SQL

## 作用

本模块实现知识库管理的数据库结构，包含以下五张表：

| 表名 | 用途 |
|------|------|
| `knowledge_base` | 知识库主表：名称、嵌入模型、分块策略、状态、统计 |
| `kb_data_source` | 数据源：文件/URL/API/连接器来源配置 |
| `kb_document` | 文档记录：上传文件元数据、处理状态 |
| `kb_chunk` | 文档分块：分块内容、向量 embedding（JSON） |
| `kb_embedding_task` | 向量化任务：异步处理进度与状态 |

## 依赖前序模块

- `01-bootstrap`：Prisma 基线
- `02-tenant-management`：`tenant` 表（各表 `tenant_id` 外键）
- `06-connector-management`：`connector` 表（数据源 type=connector 时引用，无硬外键）

## 执行顺序

```bash
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/schema.sql
mysql -u root -p shellder_agent < project-sql/12-knowledge-base/seed.sql
```

## 注意事项

1. `kb_chunk.embedding` 使用 JSON 类型存储向量数组（MySQL V1 方案）。生产环境建议迁移至支持 ANN 索引的向量数据库（如 Milvus/Qdrant）或 PostgreSQL pgvector 以获得更优检索性能。
2. `knowledge_base` 使用租户内名称唯一约束（`tenant_id` + `name`），避免同租户下重名。
3. 文档删除级联清理分块（`ON DELETE CASCADE`）；知识库删除级联清理文档/分块/数据源/任务。
4. `kb_document.file_key` 存储文件在对象存储中的 key（MinIO/S3），不保存绝对路径。
5. 软删除（`deleted_at`）仅在 `knowledge_base` 主表层面使用。

## 与 Prisma schema 的一致性

本 SQL 与 `shellder-agent-server/prisma/schema.prisma` 中阶段 11A 新增的模型定义保持一致。字段类型、索引、约束均已对齐。
