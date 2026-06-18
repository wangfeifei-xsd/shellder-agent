# 模块：OpenAPI 管理

| 属性 | 值 |
|------|-----|
| 初始方案 | 功能清单 §1.12 + §3 / 执行计划 15 |
| 菜单 key | `openapi` |

---

## 管理子菜单

| 子菜单 | 路由 |
|--------|------|
| 应用接入 | `/openapi/apps`、`/openapi/apps/:id` |
| 调用日志 | `/openapi/logs`（全局检索） |
| 接口文档 | `/openapi/docs` |

**调用日志**：应用详情页「调用日志」卡片（按应用筛选）+ 侧栏「调用日志」页（跨应用检索）；初始方案为独立菜单，V1 以详情页为主并保留全局入口。

---

## 对外 API（§3）

前缀：`/openapi/v1`（`OpenApiController`）

| 方法 | 路径 |
|------|------|
| POST | `/auth/token` |
| POST | `/sessions` |
| GET | `/sessions/:id` |
| POST | `/sessions/:id/messages` |
| GET | `/sessions/:id/stream` |
| GET | `/tasks/:id` |
| POST | `/confirmations/:id` |

鉴权：应用 `clientId` + `clientSecret` → Bearer Token；`OpenApiAuthGuard`。

---

## 管理 API

| 方法 | 路径 |
|------|------|
| CRUD | `/api/v1/openapi-apps` |
| 日志 | `/api/v1/openapi-call-logs`、`/api/v1/openapi-apps/:id/call-logs` |

---

## 数据表

- `open_api_app`
- `open_api_call_log`

---

## 租户映射

请求可传 `tenantId`（Agent id）或 `externalTenantId` → 解析为 `tenant.id`；禁用租户拒绝调用（实施规格 §1.4）。

---

## 对照初始方案

- §3 六项对外能力与 §1.12 应用接入、文档已验收
- 调用日志：详情页卡片 + 侧栏 `/openapi/logs` 双入口；数据模型与初始一致
- 与「模型接入」严格分离（硬约束 §1C）
