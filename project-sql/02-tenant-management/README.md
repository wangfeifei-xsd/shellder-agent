# 02-tenant-management — 租户管理

## 作用

- 新增 `tenant` 表：Agent 平台**自行维护**的租户主数据（实施规格 §1.3，非上层同步）。
- 为 Session、Tool、Connector、规则、OpenAPI 等后续模块提供稳定的 `tenant.id` 归属外键。

## 依赖的前序模块

| 序号 | 模块 | 说明 |
|------|------|------|
| 01 | `01-bootstrap` | 数据库连接与 Prisma 迁移流水线；无业务表 |

## 文件

| 文件 | 说明 |
|------|------|
| `schema.sql` | `tenant` 表结构、唯一键与索引（含 `config` JSON 约定） |
| `seed.sql` | 默认演示租户（`code=default`，固定 `id`，幂等 upsert） |

## 执行顺序

1. 确认已执行 `01-bootstrap`（库已创建）。
2. 执行 `schema.sql` 建表。
3. 执行 `seed.sql` 写入默认租户（可选，便于本地与后续模块联调）。
4. 应用层：在 monorepo 根目录运行 `npm run prisma:migrate`（部署）或 `npm run prisma:migrate:dev`（开发）。

## 与 Prisma 对齐

| 产物 | 路径 |
|------|------|
| Prisma 模型 | `shellder-agent-server/prisma/schema.prisma`（`model Tenant` / `enum TenantStatus`） |
| 迁移 | `shellder-agent-server/prisma/migrations/20260529000000_tenant_management/` |

> 手写 `schema.sql` 与上述迁移 DDL 保持一致；如二者冲突，以最终确认入库结构为准并回修代码模型。

## `config` JSON 约定

应用层维护，数据库不做强约束：

```json
{
  "capabilities": ["qa", "query", "action", "workflow"],
  "limits": { "maxSessions": 0, "maxTasks": 0 },
  "isolation": {
    "dataIsolationStrategy": "strict",
    "restrictCrossTenant": true,
    "connectorVisibleWithinTenant": true,
    "toolVisibleWithinTenant": true,
    "auditVisibleWithinTenant": true
  }
}
```

- `capabilities`：开通能力，问答型 `qa` / 查询型 `query` / 操作型 `action` / 流程型 `workflow`。
- `limits.maxSessions` / `limits.maxTasks`：默认限额，`0` 表示不限制。
- `isolation`：租户隔离配置（数据隔离策略、跨租户访问限制、连接器/工具/审计可见性）。

## 注意事项

- `code` 平台内唯一；重复创建返回 4xx（`409 CONFLICT`）。
- `external_tenant_id` 可空、可查询，**不触发任何同步任务**（实施规格 §1.2）。
- 禁用租户后，自模块 07 起的资源创建接口应拒绝引用该租户（本阶段仅维护状态字段）。
- `admin_user_id` 在用户模块（03）就绪前可为空。
