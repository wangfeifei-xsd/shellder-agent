# 16-openapi — OpenAPI 对外接口与管理

## 归属阶段

- 执行序号：15 — OpenAPI 对外接口与管理
- 功能清单：§3 OpenAPI + §1.12 OpenAPI 管理

## 新增表

| 表名 | 说明 |
|------|------|
| `openapi_app` | 接入应用：第三方系统在平台注册后获取凭证，配置允许访问的租户与能力范围 |
| `openapi_call_log` | 调用日志：记录第三方通过 OpenAPI 的每次请求，含状态码、耗时、成功/失败/限流 |

## 依赖

- `tenant` 表（01-bootstrap / 02-tenant-management）：`openapi_call_log.tenant_id` → `tenant.id`

## 执行顺序

1. 确认 01 ~ 15 前序 SQL 已执行
2. 执行 `schema.sql`
3. 执行 `seed.sql`（本模块无初始化数据，为空）

## 设计说明

### openapi_app

- `client_id`：全局唯一应用标识，格式 `sk_` + 随机 hex，用于鉴权请求
- `client_secret_hash`：SHA-256 哈希后的 Client Secret，不存明文
- `allowed_tenant_ids`：JSON 数组，存储允许访问的 `tenant.id` 列表
- `allowed_capabilities`：JSON 数组，如 `["qa","query","action","workflow"]`
- `rate_limit_config`：可选的限流配置，如 `{ "rateLimit": 100, "windowMs": 60000 }`
- 应用不直接关联单一租户（一个应用可访问多个租户），因此 `openapi_app` 无 `tenant_id` 外键

### openapi_call_log

- 每次 OpenAPI 请求均记录一条日志（由后端拦截器写入）
- `status` 区分 `success` / `failed` / `rate_limited`
- 关联 `openapi_app` 和可选的 `tenant`（请求时可能未映射到租户，如鉴权接口）
- 支持管理后台按应用、租户、状态、路径、时间范围查询

## 注意事项

- OpenAPI 鉴权独立于管理后台 JWT，使用 Client ID + Secret → OpenAPI JWT（issuer = `shellder-openapi`）
- 禁用租户拒绝调用（实施规格 §1.4）
- OpenAPI 接口路径前缀为 `/openapi/v1/`，与管理后台 `/api/v1/` 分离
