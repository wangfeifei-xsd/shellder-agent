# 06-connector-management — 连接器管理

## 作用

实现外部连接器配置、连通性测试及管理后台菜单（Connector Management），为 **07-工具管理** 的 Query Tool（只读库）、Action Tool（HTTP）、Notification Tool 提供连接能力。

- `connector`：**连接器配置** —— 三类连接方式（只读数据库 / HTTP API / 消息通知接口），按租户隔离，含目标系统、认证方式、超时、状态、加密凭证、可引用 Tool 范围，以及最近一次连通性测试快照。

## 三类连接器用途（）

| 类型 | 枚举值 | 用途 |
|------|--------|------|
| 只读数据库 | `db_readonly` | 查询型能力 / SQL Query Tool（**仅**经只读 DB，不经 HTTP 查数，） |
| HTTP API | `http` | 操作型 Action Tool、流程型外部接口步骤（**不用于**查询型数据查询） |
| 消息通知接口 | `notification` | Notification Tool、流程型通知步骤 |

## 依赖的前序模块

| 序号 | 模块 | 说明 |
|------|------|------|
| 02 | `02-tenant-management` | `tenant` 表；`connector.tenant_id` 外键引用 `tenant.id` |
| 03 | `03-user-rbac` | `connector` 菜单权限、`connector.manage` 模块权限（权限目录已预置） |
| 04 | `04-audit-center` | 连通性测试 / 外部调用记入 `external_call_audit`；写操作经 `@Audit` 落 `user_action_audit` |

## 文件

| 文件 | 说明 |
|------|------|
| `schema.sql` | `connector` 表结构、索引与外键 |
| `../06b-connector-db-metadata/` | `connector_db_metadata`（只读库结构抽取与 ER 图，查询型 §4） |

## 执行顺序

1. 确认已执行 `01-bootstrap`、`02-tenant-management`、`03-user-rbac`、`04-audit-center`、`05-policy-engine`。
2. 执行本目录 `schema.sql` 建表（或运行 Prisma 迁移，见下）。

## 与 Prisma 对齐

| 产物 | 路径 |
|------|------|
| Prisma 模型 | `shellder-agent-server/prisma/schema.prisma`（`Connector` / `enum ConnectorType` / `enum ConnectorStatus` / `enum ConnectorTestStatus`） |
| 迁移 | `shellder-agent-server/prisma/migrations/20260529040000_connector_management/` |

> 手写 `schema.sql` 与上述迁移 DDL 保持一致；如二者冲突，以最终确认入库结构为准并回修代码模型。

## config JSON 结构

```jsonc
{
  "properties": {                      // 非敏感的类型相关配置
    "database": "report",              //   db_readonly：库名 / 用户名 / sslMode 等
    "username": "readonly",
    "baseHeaders": { "X-App": "a" }    //   http/notification：固定请求头等
  },
  "allowedToolScopes": ["order:read"], // 可被哪些 Tool 引用（07 工具按此校验绑定）
  "secretCipher": "v1:<base64>"        // AES-256-GCM 加密后的凭证 JSON；无凭证为 null
}
```

加密凭证明文结构（加密前，按 `auth_type` 不同）：

| auth_type | 凭证字段 |
|-----------|----------|
| `none` | 无 |
| `basic` | `{ username, password }` |
| `bearer` | `{ token }` |
| `api_key` | `{ headerName, apiKey }` |
| `custom` | `{ "header.X-Xxx": "..." }`（以 `header.` 前缀的键作为请求头下发） |

- 加密密钥来自环境变量 `CONNECTOR_SECRET_KEY`（生产必须配置高强度随机串）；密钥经 SHA-256 派生为 32 字节。
- **详情接口仅回显凭证字段名掩码与 `hasSecret`，禁止回传明文**（敏感字段脱敏）。

## 连通性测试（验收标准 2）

- `POST /api/v1/connectors/:id/test`：
  - `http` / `notification`：对 `target` 发起真实 HTTP `GET`（带认证头），`< 400` 视为连通且认证有效，`401/403` 视为认证失败，返回状态码与响应耗时。
  - `db_readonly`：使用 mysql2 执行 **`SELECT 1`** 校验库级连通（见 **06b-connector-db-metadata** 元数据与 ER 图）。
- 测试结果记入 `external_call_audit`（`connector_id` 关联、`target`、`status`、`status_code`、`duration_ms`、`error_message`）。
- 最近一次测试快照同时冗余写入 `connector.last_test_*` 字段，供列表 / 详情直接展示。

## 与 04 审计的关系

- `external_call_audit.connector_id`（阶段 04 已建字段）以**松引用**关联 `connector.id`，**刻意不建外键**：
  - 保持审计为独立留痕数据，连接器删除后历史调用记录仍可读。
  - 连接器详情的「最近调用日志 / 失败率 / 超时」由 `external_call_audit` 按 `connector_id` 反查聚合。

## 租户隔离与约束

- 列表 / 详情 / 写操作统一经 `PermissionService` 解析有效权限：超管可见全部并可选 `?tenantId` 过滤；非超管仅限其绑定租户。
- `connector.tenant_id` 必须来自 `tenant` 表（），创建时校验租户存在。
- **禁用租户不可新建连接器**（验收标准 3）：创建时校验 `tenant.status != disabled`，否则返回 `TENANT_DISABLED`。
- 不可迁移租户（更新 DTO 不含 `tenantId`）。

## 注意事项

- 凭证仅以密文落库；审计 `request_summary` 仅保存脱敏摘要，禁止落库口令、密钥等敏感原文。
- 本模块**不包含** Tool 的注册与绑定（属 07-工具管理）；`allowedToolScopes` 仅为连接器侧声明，关联 Tool 列表在 07 就绪后反查。
