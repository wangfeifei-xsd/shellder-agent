# 08 — 会话与消息核心

## 模块说明

本模块实现 Agent 平台的**会话（Session）与消息（Message）持久化**，对应：

- （会话列表 — 后端 + 基础列表 UI）
- （Session 模块：创建、上下文装配、历史查询）
- （Message 模块：四类消息存储、按会话查询时间线）
- （Session 与 Message 分模块实现）

## 依赖前序模块

| 序号 | 模块 | 依赖内容 |
|------|------|----------|
| 02 | 租户管理 | `tenant` 表；`session.tenant_id → tenant.id` |
| 03 | 用户与权限 | `user` 表；`session.user_id` 引用用户 |
| 07 | 工具注册 | Tool 表（消息中可引用工具调用结果） |

## 表结构

### `session`

| 字段 | 说明 |
|------|------|
| `id` | UUID 主键 |
| `tenant_id` | 租户外键 → `tenant.id`（Restrict） |
| `user_id` | 发起用户 ID |
| `title` | 会话标题（可空） |
| `status` | `active` / `completed` / `failed` / `cancelled`（`pending_confirm` 由 **13-agent-runtime** 增量追加，与 `schema.prisma` 终态一致） |
| `capability_type` | `qa` / `query` / `action` / `workflow`（可空） |
| `summary` | 会话上下文摘要 |
| `has_task` | 是否触发任务 |
| `has_confirmation` | 是否触发人工确认 |
| `last_message_at` | 最近消息时间（冗余，供列表排序） |
| `created_at` / `updated_at` | 审计 |

### `message`

| 字段 | 说明 |
|------|------|
| `id` | UUID 主键 |
| `session_id` | 会话外键 → `session.id`（Cascade） |
| `type` | `user` / `system` / `tool` / `confirmation` |
| `role` | `user` / `assistant` / `system` / `tool` |
| `content` | 消息内容 JSON |
| `seq` | 同会话内排序序号 |
| `created_at` | 创建时间 |

## 执行顺序

```bash
# 1. 确保 01-07 的 schema.sql / seed.sql 已执行
# 2. 执行本模块
mysql -u root -p shellder_agent < project-sql/08-session-message/schema.sql
mysql -u root -p shellder_agent < project-sql/08-session-message/seed.sql
```

## 注意事项

- `session.tenant_id` 外键使用 `ON DELETE RESTRICT`，租户只禁用不删除。
- `message.session_id` 外键使用 `ON DELETE CASCADE`，会话删除时消息一并清理。
- `last_message_at` 为冗余字段，每次追加消息时由应用层更新，避免列表排序时 JOIN 消息表。
- 本目录 `schema.sql` 为阶段 08 增量（不含 `pending_confirm`）；Prisma 终态以 `schema.prisma` 为准，`pending_confirm` 在 **13-agent-runtime** 迁移中追加。
