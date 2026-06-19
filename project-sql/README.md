# project-sql

MySQL 全量初始化脚本，用于**首次上线**部署。各子目录按模块分类存放 DDL / 种子数据，可直接执行单模块 SQL；也可使用根目录合并后的全量文件。

## 库名

默认库名 **`agent_platform`**（与 `.env` 中 `MYSQL_DATABASE` / `DATABASE_URL` 一致）。脚本内已 `USE agent_platform` 并对表名做了库名限定。

数据库由运维手动维护，与 Docker 发布解耦：

```bash
mysql -h HOST -u USER -p < project-sql/00-all-schema.sql
mysql -h HOST -u USER -p < project-sql/00-all-seed.sql
```

## 单模块执行

```bash
mysql -h 127.0.0.1 -u agent -p < project-sql/02-tenant-management/schema.sql
mysql -h 127.0.0.1 -u agent -p < project-sql/02-tenant-management/seed.sql
```

有种子数据的模块：`02`、`03`、`10`、`19`、`21`、`22`、`23`（`22`/`23` 仅 Prompt 种子，无独立 DDL 合入全量 schema 时见 `00-all-seed.sql`）。

## 增量升级（已有库）

若库已由旧版 `00-all-schema.sql` 初始化，勿重跑全量 DDL，按序号执行增量目录即可，例如：

```bash
mysql -h HOST -u USER -p < project-sql/22-tool-http-query/schema.sql
mysql -h HOST -u USER -p < project-sql/22-tool-http-query/seed.sql
mysql -h HOST -u USER -p < project-sql/23-routing-llm-classify/seed.sql   # 可选 LLM Stage1
```

| 目录 | 说明 |
|------|------|
| `22-tool-http-query` | `tool.type` 增加 `http_query`；`action.http_query.catalog` Prompt |
| `23-routing-llm-classify` | `routing.classify.system` Prompt（能力路由 LLM Stage1，默认关） |
