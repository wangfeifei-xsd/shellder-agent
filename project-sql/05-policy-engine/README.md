# 05-policy-engine — 策略引擎与规则配置

## 作用

实现 Policy 模块（权限判断、风险等级判断、确认拦截，§8）及平台侧显式规则配置，支撑管理后台「知识库与规则」下的两个菜单（规则部分）：

- `rule`：**规则配置** —— 显式规则（高风险识别、确认拦截、能力级限制、通用），按租户隔离，含类型、条件 DSL、动作、优先级、启用状态。
- `rule_hit`：**规则命中记录** —— 请求命中的规则、命中时间、请求内容摘要、处理结果，关联 session/task ID。

> 知识层、媒体等见 **11A-知识库**；本模块仅规则与 Policy。

## 依赖的前序模块

| 序号 | 模块 | 说明 |
|------|------|------|
| 02 | `02-tenant-management` | `tenant` 表；`rule` / `rule_hit` 的 `tenant_id` 外键引用 `tenant.id` |
| 03 | `03-user-rbac` | `knowledge` 菜单权限、新增 `rule.manage` 模块权限；命中留痕 `caller_user_id` 取自 `user` |
| 04 | `04-audit-center` | 规则增改删经 `@Audit` 自动写 `user_action_audit` |

## 文件

| 文件 | 说明 |
|------|------|
| `schema.sql` | `rule` / `rule_hit` 表结构、索引与外键 |
| `seed.sql` | 无平台级初始化数据（规则按租户运行期配置），保留空文件并注明 |

## 执行顺序

1. 确认已执行 `01-bootstrap`、`02-tenant-management`、`03-user-rbac`、`04-audit-center`。
2. 执行本目录 `schema.sql` 建表（或运行 Prisma 迁移，见下）。
3. `seed.sql` 无需执行。

## 与 Prisma 对齐

| 产物 | 路径 |
|------|------|
| Prisma 模型 | `shellder-agent-server/prisma/schema.prisma`（`Rule` / `RuleHit` / `enum RuleType` / `enum RuleAction` / `enum RuleStatus`） |
| 迁移 | `shellder-agent-server/prisma/migrations/20260529030000_policy_engine/` |

> 手写 `schema.sql` 与上述迁移 DDL 保持一致；如二者冲突，以最终确认入库结构为准并回修代码模型。

## Policy 评估（platform-server）

- `PolicyService.evaluate(context, { persistHits })` → `{ allow, needConfirm, highRisk, result, matchedRules, reason }`（API 要点）。
- **Tool 执行前必须调用 Policy（）**；07 工具、12 运行时、14 审批依赖本服务。
- 规则按 `priority` 升序评估（数值越小越优先）：
  - `deny` → 拦截（`allow=false`）。
  - `need_confirm` → 需人工确认（`needConfirm=true`，中断执行转 14-审批）。
  - `mark_high_risk` → 标记高风险（`highRisk=true`，供风险动作审计聚合）。
  - `allow` → 显式放行（不覆盖更高优先级的 `deny`）。
- 风险等级判断：Tool 自身 `riskLevel='high'` 直接标记 `highRisk`。
- 命中规则写入 `rule_hit`（留痕失败不抛出，不阻断业务主流程）。

### conditions DSL 结构

```jsonc
{
  "match": "all",                 // 子句匹配模式：all（默认）/ any
  "toolNames": ["deleteUser"],    // 命中 Tool 名称（精确）
  "toolNameContains": "delete",   // Tool 名称包含匹配（忽略大小写）
  "riskLevels": ["high"],          // 命中风险等级 low/medium/high
  "capabilities": ["action"],      // 命中业务能力 qa/query/action/workflow
  "needConfirmation": true,         // 命中 Tool 自身 needConfirmation 标记
  "permissionScopes": ["order:write"] // 命中 Tool 权限范围
}
```

- 未配置任何子句 → 租户内全量匹配。
- `match=all`：所有已配置子句均满足才命中；`match=any`：任一满足即命中。

## API（分页 + 筛选）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/rules` | 规则列表，筛选 `tenantId`、`type`、`action`、`status`、`keyword` |
| POST | `/api/v1/rules` | 新建规则（`@Audit rule.create`） |
| GET | `/api/v1/rules/:id` | 规则详情 |
| PATCH | `/api/v1/rules/:id` | 更新规则（`@Audit rule.update`；不可迁移租户） |
| PATCH | `/api/v1/rules/:id/status` | 启用/停用（`@Audit rule.updateStatus`） |
| DELETE | `/api/v1/rules/:id` | 删除规则（`@Audit rule.delete`；命中历史保留，置空 `rule_id`） |
| POST | `/api/v1/rules/evaluate` | 规则试评估（Mock 上下文，验收标准 1） |
| GET | `/api/v1/rule-hits` | 命中记录列表，筛选 `tenantId`、`ruleId`、`ruleType`、`sessionId`、`taskId`、`keyword` |

## 租户隔离（验收标准 3）

- 列表 / 命中查询统一经 `PermissionService` 解析当前用户有效权限：
  - **超级管理员**：可见 / 可维护全部；可选 `?tenantId` 过滤。
  - **非超管**：仅可见 / 可维护 `tenant_id ∈ 用户绑定租户` 的规则与命中。
- 写操作（创建/更新/删除/试评估）先校验对目标租户的访问权（`assertTenantAccess`），越权返回 `TENANT_FORBIDDEN`。

## 注意事项

- `rule.tenant_id` 必须来自 `tenant` 表（），创建时校验租户存在。
- `rule_hit` 为保留性数据：`tenant_id` 外键 `ON DELETE RESTRICT`；`rule_id` 外键 `ON DELETE SET NULL` 以保留命中历史。
- 本模块**不包含** SQL 表白名单、行数限制等（属 SQL 查询工具配置）。
- `request_summary` 仅保存脱敏摘要，禁止落库口令、密钥等敏感原文。
