# 10 — 能力路由（Capability Routing）

## 模块说明

本模块实现平台「能力路由」功能（架构 Capability Routing）：

1. **能力目录**（`capability` 表）：维护平台能力清单，包含四类能力（qa/query/action/workflow）的描述、适用系统、依赖工具、权限要求。
2. **路由规则**（`routing_rule` 表）：配置能力与 Tool / 条件的关联，定义每类能力可调用范围。
3. **路由引擎**：根据用户输入文本匹配路由规则，返回命中能力类型、理由、候选能力、是否需确认。

## 依赖的前序模块

| 序号 | 模块 | 依赖关系 |
|------|------|----------|
| 02 | 租户管理 | `capability.tenant_id` / `routing_rule.tenant_id` → `tenant.id` |
| 05 | 策略引擎 | 路由引擎调用 `PolicyService.evaluate` 判断 `needConfirmation` |
| 07 | 工具注册 | `routing_rule.tool_ids` 引用 `tool.id`（松引用，不建外键） |

## 执行顺序

```
01-bootstrap → 02-tenant-management → ... → 09-task-worker → 10-capability-routing
```

先执行前序模块 SQL，再执行本模块：

1. `schema.sql` — 创建 `capability`、`routing_rule` 表及外键
2. `seed.sql` — 无实际初始化数据（能力按租户隔离，需先有租户）

## 表结构

### capability（能力目录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) | 主键 |
| tenant_id | CHAR(36) | 所属租户 → tenant.id |
| type | ENUM | qa/query/action/workflow |
| name | VARCHAR(128) | 能力名称（租户内唯一） |
| description | VARCHAR(512) | 能力描述 |
| applicable_system | VARCHAR(256) | 适用系统/业务场景 |
| dependent_tools | JSON | 依赖的工具 ID 列表 |
| permission_requirements | JSON | 权限要求（permissionScope 列表） |
| priority | INT | 路由优先级（越小越优先） |
| status | ENUM | enabled/disabled |
| created_at | DATETIME(3) | 创建时间 |
| updated_at | DATETIME(3) | 更新时间 |

### routing_rule（路由规则）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) | 主键 |
| tenant_id | CHAR(36) | 所属租户 → tenant.id |
| capability_id | CHAR(36) | 关联能力 → capability.id |
| name | VARCHAR(128) | 规则名称 |
| description | VARCHAR(512) | 规则说明 |
| conditions | JSON | 匹配条件 DSL：keywords/patterns/intents |
| tool_ids | JSON | 命中时可调用的工具 ID 列表 |
| priority | INT | 同能力内优先级（越小越优先） |
| need_confirmation | BOOLEAN | 是否需人工确认（路由级） |
| status | ENUM | enabled/disabled |
| created_at | DATETIME(3) | 创建时间 |
| updated_at | DATETIME(3) | 更新时间 |

## conditions DSL 结构

```json
{
  "keywords": ["查询", "订单"],
  "patterns": ["^查.*订单"],
  "intents": ["order_query"]
}
```

- `keywords`：关键词列表，输入文本包含任一关键词即匹配
- `patterns`：正则表达式模式，命中任一即匹配
- `intents`：意图标签，保留接口供 NLU/LLM 引擎扩展

## 注意事项

- `routing_rule.tool_ids` 为松引用（JSON 数组存 tool.id），不建外键，避免 Tool 删除时联动阻断路由规则。
- `capability` 删除时级联删除关联 `routing_rule`（ON DELETE CASCADE）。
- `tenant_id` 外键 ON DELETE RESTRICT，与前序模块一致。
- 能力创建时验证租户 `config.capabilities` 是否开通该类型（验收标准 2）。
