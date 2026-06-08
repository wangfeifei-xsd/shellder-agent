# project-sql

MySQL 全量初始化脚本，用于**首次上线**部署。各子目录按模块分类存放 DDL / 种子数据，可直接执行单模块 SQL；也可使用根目录合并后的全量文件。

## 库名

默认库名 **`agent_platform`**（与 `.env` 中 `MYSQL_DATABASE` / `DATABASE_URL` 一致）。脚本内已 `USE agent_platform` 并对表名做了库名限定。

Docker Compose 部署时读取 **`.env.example`**；`shellder-agent-server` 在 `SEED_ON_STARTUP=true` 时会幂等执行 `00-all-seed.sql`（生产请保持 `false`）。

## 全量执行（推荐）

```bash
cd project-sql
mysql -h 127.0.0.1 -u agent -p < 00-all-schema.sql
mysql -h 127.0.0.1 -u agent -p < 00-all-seed.sql
```

## 单模块执行

```bash
mysql -h 127.0.0.1 -u agent -p < project-sql/02-tenant-management/schema.sql
mysql -h 127.0.0.1 -u agent -p < project-sql/02-tenant-management/seed.sql
```

有种子数据的模块：`02`、`03`、`10`、`19`、`21`。
