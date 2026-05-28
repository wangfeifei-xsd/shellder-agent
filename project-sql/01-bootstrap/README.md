# 01-bootstrap — 工程脚手架与基础设施

## 作用

- 初始化 Agent 平台 MySQL 数据库连接与 Prisma 迁移流水线
- **不包含**业务表；`tenant` 等表在 `02-tenant-management` 模块交付

## 依赖

- 无前置 SQL 模块
- MySQL 8.0

## 执行顺序

1. 创建数据库（Docker Compose 会自动创建 `agent_platform`）
2. 执行 `schema.sql`（本文件为空操作说明，无 DDL）
3. 执行 `seed.sql`（无数据）
4. 在 monorepo 根目录运行 `npm run prisma:migrate:dev` 或 `npm run prisma:migrate`

## 与 Prisma 对齐

| 产物 | 路径 |
|------|------|
| Prisma schema | `shellder-agent-server/prisma/schema.prisma` |
| 初始迁移 | `shellder-agent-server/prisma/migrations/20260528000000_bootstrap/` |

## 注意事项

- 后续模块必须在读取本目录 SQL 后再做增量设计
- `tenant_id` 外键须引用 `tenant.id`（自模块 02 起）
