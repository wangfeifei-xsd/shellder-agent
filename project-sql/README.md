# project-sql

按模块拆分的 MySQL DDL / 种子数据，与 `shellder-agent-server` Prisma 迁移对齐。

## 库名

所有 SQL 表名均带库名限定（`库名`.`表名`），并在文件头包含 `USE`：

- 默认库名：**`agent_platform`**（与根目录 `.env` 中 `MYSQL_DATABASE` / `DATABASE_URL` 一致）
- 修改库名：编辑 [`db-name.cnf`](./db-name.cnf) 后执行：

```bash
python3 qualify-sql-db.py
./merge-all-sql.sh
```

## 全量执行

```bash
cd project-sql
./merge-all-sql.sh
mysql -h 127.0.0.1 -u agent -p < 00-all-schema.sql
mysql -h 127.0.0.1 -u agent -p < 00-all-seed.sql
```

也可显式指定库（脚本内已 `USE agent_platform`）：

```bash
mysql -h 127.0.0.1 -u agent -p agent_platform < 00-all-schema.sql
```

## 单模块执行

```bash
mysql -h 127.0.0.1 -u agent -p < project-sql/02-tenant-management/schema.sql
```

## 工具

| 文件 | 说明 |
|------|------|
| `merge-all-sql.sh` | 合并各模块为 `00-all-schema.sql` / `00-all-seed.sql` |
| `add-table-comments.py` | 为各模块 `CREATE TABLE` 追加 MySQL 表级 `COMMENT`（可重复执行） |
| `qualify-sql-db.py` | 为模块 SQL 添加 `USE` 与 `` `库名`.`表名` `` 限定 |
| `db-name.cnf` | 目标库名配置 |
