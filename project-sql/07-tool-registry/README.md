# 模块 07 — 工具注册与工具管理（SQL 说明）

> 对应执行计划：[`07-工具注册与工具管理.md`](../../../project-analysis/agent-platform-执行计划/07-工具注册与工具管理.md)
> 功能清单 §1.5 / 架构 §4.3 Tool Registry、工具层。

## 1. 作用

实现 Tool Registry：Tool 注册、元数据、JSON Schema 校验、权限元数据，以及管理后台工具管理全菜单（工具列表 / 新建工具 / 工具详情 / 调用测试 / SQL 查询工具）。本模块新增 `tool` 一张表。

## 2. 依赖的前序模块

| 模块 | 依赖关系 |
|------|----------|
| `02-tenant-management` | `tool.tenant_id → tenant.id`（按租户隔离，ON DELETE RESTRICT） |
| `03-user-rbac` | `tool` 菜单权限、`tool.manage` 模块权限；`permission_scope` 配合 `role.tool_scopes` |
| `04-audit-center` | 工具调用记入 `tool_call_audit`（松引用 `tool_id`/`tool_name`，无外键）；写操作经 `@Audit` 落 `user_action_audit` |
| `05-policy-engine` | Tool 执行前必须调用 `Policy.evaluate`（架构 §8）；命中记入 `rule_hit` |
| `06-connector-management` | `tool.connector_id → connector.id`（按需关联，ON DELETE SET NULL） |

## 3. 执行顺序

```
01-bootstrap
  → 02-tenant-management
  → 03-user-rbac
  → 04-audit-center
  → 05-policy-engine
  → 06-connector-management
  → 07-tool-registry   ← 本模块
```

先执行 `schema.sql` 创建 `tool` 表与外键，再执行 `seed.sql`（本模块为空）。

## 4. 表结构概览

`tool`：Tool 注册元数据（按租户）。

固定元数据字段（执行计划 §3）：`name`、`description`、`input_schema`、`output_schema`、`permission_scope`、`risk_level`、`need_confirmation`、`timeout_ms`、`idempotency_key`、`audit_event_type`；类型 `type ∈ {query, action, workflow, notification}`。

- `(tenant_id, name)` 唯一，避免同租户重名。
- `input_schema` / `output_schema` 为 JSON Schema，保存前由应用层（ajv）校验合法性，非法拒绝（验收标准 1）。
- `connector_id` 关联连接器，连接器删除后置空（SET NULL），不阻断 Tool 历史。
- 类型相关配置存于 `config`（JSON），结构见 `schema.sql` 注释。

## 5. `config` 结构约定

| 字段 | 适用类型 | 说明 |
|------|----------|------|
| `config.sql` | query | SQL 查询工具配置：`tableWhitelist`、`fieldWhitelist`、`maxRows`、`maxExecutionMs`、`templates[]` |
| `config.http` | action / notification | HTTP 调用配置：`method`、`path`、`headers`、`bodyTemplate`（认证头由连接器凭证注入） |
| `config.workflow` | workflow | 步骤编排 `steps[]`（编排执行见 12/13） |

## 6. 一致性检查（与前序模块）

- `tool.tenant_id` 外键 `ON DELETE RESTRICT`，与 `connector` / `rule` / 审计三表一致；平台内租户只禁用不删除。
- `tool.connector_id` 外键 `ON DELETE SET NULL`，与 `rule_hit.rule_id` 的留痕策略思路一致：被引用对象删除后保留主记录、置空引用。
- `tool_call_audit`（04）与 `rule_hit`（05）对 Tool 均为松引用（`tool_id` / `tool_name`），刻意不建外键，保持审计 / 留痕独立、不阻断 Tool 删除。
- 工具菜单权限（`tool`）与模块权限（`tool.manage`）已存在于 03 权限目录，本模块不重复建权限数据。

## 7. 验收标准对应（执行计划 §7）

1. 四类 Tool CRUD 完整；非法 JSON Schema 拒绝保存 → `input_schema`/`output_schema` 保存前 ajv 校验。
2. 调用测试在 Policy 拒绝时不执行外部调用 → 执行前 `Policy.evaluate`，`deny`/`need_confirm` 短路。
3. SQL 工具测试超行数 / 超时被拒绝 → `config.sql.maxRows` / `maxExecutionMs` 限制。
4. 工具列表按租户隔离 → 列表查询强制 `tenant_id` 过滤（非超管按绑定租户）。
