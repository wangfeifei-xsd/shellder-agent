# 04-audit-center — 审计模块与审计中心

## 作用

实现 Audit 模块的采集与查询，支撑管理后台「审计中心」四菜单（Audit）：

- `tool_call_audit`：**工具调用审计** —— Tool 名称、调用人、时间、入参摘要、结果状态、耗时；07 工具模块起写入真实数据。
- `user_action_audit`：**用户操作审计** —— 后台配置、审批、权限变更等写操作；由 `AuditInterceptor` + `@Audit` 装饰器自动采集，含操作前后差异摘要。
- `external_call_audit`：**外部接口审计** —— 外部系统调用的目标、状态、耗时、失败原因；06 连接器 / 13 业务能力起写入。
- **风险动作审计**：聚合**只读视图**，不单独建第四套采集通道。V1 聚合自 `tool_call_audit.high_risk = true`，14-审批中心 就绪后再 JOIN `approval`。

## 依赖的前序模块

| 序号 | 模块 | 说明 |
|------|------|------|
| 01 | `01-bootstrap` | 数据库与 Prisma 迁移流水线 |
| 02 | `02-tenant-management` | `tenant` 表；三张审计表 `tenant_id` 外键引用 `tenant.id` |
| 03 | `03-user-rbac` | 操作人 / 调用人取自 `user`；`audit` 菜单权限、`audit.view` 模块权限 |

## 文件

| 文件 | 说明 |
|------|------|
| `schema.sql` | `tool_call_audit` / `user_action_audit` / `external_call_audit` 表结构、索引与外键 |
| `seed.sql` | 无初始化数据（审计记录运行期采集），保留空文件并注明 |

## 执行顺序

1. 确认已执行 `01-bootstrap`、`02-tenant-management`、`03-user-rbac`。
2. 执行本目录 `schema.sql` 建表（或运行 Prisma 迁移，见下）。
3. `seed.sql` 无需执行。

## 与 Prisma 对齐

| 产物 | 路径 |
|------|------|
| Prisma 模型 | `shellder-agent-server/prisma/schema.prisma`（`ToolCallAudit` / `UserActionAudit` / `ExternalCallAudit` / `enum AuditStatus`） |
| 迁移 | `shellder-agent-server/prisma/migrations/20260529020000_audit_center/` |

> 手写 `schema.sql` 与上述迁移 DDL 保持一致；如二者冲突，以最终确认入库结构为准并回修代码模型。

## 采集机制（platform-server）

- `AuditService.logToolCall / logUserAction / logExternalCall`：统一采集入口，失败不抛出（审计不阻断业务）。
- `@Audit({ action, module, targetType })` 装饰器 + 全局 `AuditInterceptor`：管理后台写操作（POST/PATCH/DELETE）成功或失败后自动写 `user_action_audit`；`diff` 记录请求参数与脱敏后的 body。
- 已挂载审计的写接口：用户、角色、权限策略、租户的增改删 / 状态变更 / 隔离配置。

## 查询 API（分页 + 筛选）

| 方法 | 路径 | 筛选 |
|------|------|------|
| GET | `/api/v1/audit/tool-calls` | `toolName`、`tenantId`、`callerUserId`、`status`、`keyword` |
| GET | `/api/v1/audit/user-actions` | `action`、`module`、`operatorUserId`、`tenantId`、`keyword` |
| GET | `/api/v1/audit/external-calls` | `target`/`keyword`、`tenantId`、`status` |
| GET | `/api/v1/audit/risk-actions` | `tenantId`（聚合 `high_risk` 工具调用，无数据时空态） |

## 租户隔离（验收标准 4）

- 查询统一经 `PermissionService` 解析当前用户有效权限：
  - **超级管理员**：可见全部；可选 `?tenantId` 过滤。
  - **非超管**：仅可见 `tenant_id ∈ 用户绑定租户` 的记录（平台级 `tenant_id = NULL` 记录不下发）。
- 用户操作审计的 `tenant_id` 取请求头 `x-active-tenant-id`（管理后台顶栏「当前操作租户」）。

## 注意事项

- 审计为保留性数据：`tenant_id` 外键 `ON DELETE RESTRICT`；平台内租户只禁用不删除，不会触发级联清理。
- `tool_call_audit` 本阶段仅建表与提供 `logToolCall`，真实数据自 07 起写入（验收标准 2）。
- 风险动作页在无 `high_risk` 工具调用、无审批数据时为空态（验收标准 3）。
- `request_summary` / `diff` 等字段只保存脱敏摘要，禁止落库口令、密钥等敏感原文。
