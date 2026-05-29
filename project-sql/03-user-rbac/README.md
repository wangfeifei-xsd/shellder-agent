# 03-user-rbac — 用户与权限（RBAC）

## 作用

- 新增平台**独立账号体系**与 **RBAC**（功能清单 §1.10、实施规格 §1.5）：
  - `user`：平台登录账号（bcrypt 口令哈希，启用/禁用）。
  - `role`：角色，承载菜单权限、模块权限、Tool 权限范围与能力/审批策略。
  - `user_role`：用户-角色多对多。
  - `user_tenant`：用户-租户多对多绑定（`tenant_id → tenant.id`，支持多租户）。
- 支撑 JWT 登录（`iss=agent-platform`，不与上层共享 Token）与按菜单/模块/租户的访问控制。

## 依赖的前序模块

| 序号 | 模块 | 说明 |
|------|------|------|
| 01 | `01-bootstrap` | 数据库与 Prisma 迁移流水线 |
| 02 | `02-tenant-management` | `tenant` 表；`user_tenant.tenant_id` 外键引用 `tenant.id`，且默认租户 `code=default` 供 seed 绑定 |

## 文件

| 文件 | 说明 |
|------|------|
| `schema.sql` | `user` / `role` / `user_role` / `user_tenant` 表结构、唯一键、索引与外键 |
| `seed.sql` | 内置「超级管理员」角色 + 默认管理员 `admin/admin123` + 角色与默认租户绑定（幂等） |

## 执行顺序

1. 确认已执行 `01-bootstrap`、`02-tenant-management`（含 `tenant` 默认租户 seed）。
2. 执行本目录 `schema.sql` 建表（或运行 Prisma 迁移，见下）。
3. 执行 `seed.sql` 写入默认管理员与超级管理员角色。
4. 应用层：在 monorepo 根目录运行 `npm run prisma:migrate:dev`（开发）或 `npm run prisma:migrate`（部署）。

> `shellder-agent-server` 启动时还会**自动幂等创建**默认管理员（见 `auth/auth-bootstrap.service.ts`），
> 因此本地即使未手动执行 `seed.sql` 也能用 `admin/admin123` 登录。设置环境变量 `AUTH_BOOTSTRAP=false` 可关闭该行为；
> `ADMIN_USERNAME` / `ADMIN_PASSWORD` 可覆盖默认账号口令。

## 与 Prisma 对齐

| 产物 | 路径 |
|------|------|
| Prisma 模型 | `shellder-agent-server/prisma/schema.prisma`（`User` / `Role` / `UserRole` / `UserTenant` / `enum UserStatus`） |
| 迁移 | `shellder-agent-server/prisma/migrations/20260529010000_user_rbac/` |

> 手写 `schema.sql` 与上述迁移 DDL 保持一致；如二者冲突，以最终确认入库结构为准并回修代码模型。

## `role.policy` JSON 约定

应用层维护，数据库不做强约束：

```json
{
  "capabilities": ["qa", "query", "action", "workflow"],
  "canApproveHighRisk": true
}
```

- `capabilities`：四类业务能力访问权限（问答 `qa` / 查询 `query` / 操作 `action` / 流程 `workflow`）。
- `canApproveHighRisk`：是否拥有高风险动作审批权限。

`role.menus` / `role.modules` / `role.tool_scopes` 均为字符串数组；`menus`、`tool_scopes` 中的 `"*"` 表示全部。

## 注意事项

- `username`、`role.code` 平台内唯一；重复创建返回 `409 CONFLICT`。
- `user_tenant.tenant_id` 必须为 `tenant` 表已登记记录；绑定时校验存在且 `status=enabled`（实施规格 §1.4）。
- 禁用用户（`status=disabled`）无法登录（验收标准 4）。
- 内置账号 / 角色（`is_system=true`）不可删除，内置管理员不可禁用。
- JWT 载荷含用户 ID、角色 code 列表、可访问租户 id 列表（验收标准 3）。
- 删除用户级联清理其 `user_role` / `user_tenant`；删除租户受 `user_tenant` 外键 `RESTRICT` 约束（需先解绑）。
