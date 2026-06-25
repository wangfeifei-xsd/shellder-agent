# 16 — 规则与 Policy

| 属性 | 值 |
|------|-----|
| 菜单 | **规则**（独立顶级，无「实验中」） |
| 路由 | `/rules`、`/rule-hits` |
| 后端 | `policy/`（`PolicyService`、`policy/rule/`） |
| 状态 | **已产品化**（2026-06） |

---

## 侧栏位置

位于 **OpenAPI 管理** 之后、**审批中心** 之前（与 `menu-items.tsx` 一致）。

| 子菜单 | 路由 |
|--------|------|
| 规则配置 | `/rules` |
| 规则命中记录 | `/rule-hits` |

RBAC：菜单 `rule`、模块 `rule.manage`。

---

## 与能力路由规则的区别

| 类型 | 表 | 管理菜单 | 命中留痕 |
|------|-----|----------|----------|
| **Policy 显式规则** | `rule` | 规则 / 规则配置 | `rule_hit`（`rule_id` 有值） |
| **能力路由规则** | `routing_rule` | 能力路由 / 路由规则 | 路由级确认时写入 `[路由] 规则名` 快照（`rule_id` 为空） |

二者职责不可混用：路由规则决定「走哪条 Tool」；Policy 规则决定「能否执行 / 是否需确认 / 是否高风险」。

---

## 规则命中记录（`rule_hit`）

### 写入时机

| 场景 | 写入方 | 说明 |
|------|--------|------|
| Tool 执行前 Policy 评估 | `PolicyService.evaluate`（默认 `persistHits: true`） | 工具管理调用测试、Runtime Step4 等 |
| 路由级确认中断前 | `AgentRuntimeService.persistPolicyHitsForContext` | Copilot / 会话调试 / OpenAPI 共用 Runtime |
| 路由级确认且无 Policy 命中 | `AgentRuntimeService.recordRoutingConfirmHit` | 规则名前缀 `[路由]` |
| 路由测试 / 引擎内预览 | `checkNeedConfirmation` | **`persistHits: false`**，不落库 |
| 规则配置「试评估」 | `POST /api/v1/rules/evaluate` | 可选 `persistHits` |

### 查询

- `GET /api/v1/rule-hits`（按租户、规则类型、session/task、关键字）
- 管理端须选择顶栏 **当前操作租户**（与 Copilot 预览租户一致）

---

## 规则配置 UI（现网）

- 匹配条件 **Tool 名称**：从当前租户 `fetchAllTools` 下拉搜索，仍支持手动输入（`mode="tags"`）
- 试评估抽屉：模拟 Tool 上下文，可选写入命中记录

---

## 关键代码

| 组件 | 路径 |
|------|------|
| Policy 评估 | `policy/policy.service.ts` |
| 规则 CRUD / 命中查询 | `policy/rule/rule.service.ts` |
| Runtime 确认前留痕 | `agent-runtime/agent-runtime.service.ts` |
| 路由 needConfirmation | `capability/routing-engine.service.ts`（`routing_rule.needConfirmation` ∪ Policy） |
| 前端 | `pages/console/rules/page.tsx`、`pages/console/rule-hits/page.tsx` |

---

## 验收要点

1. 配置 `need_confirm` 类 Policy 规则后，工具调用测试或 Runtime 可触发待确认。
2. Copilot 嵌入触发「路由级确认」后，**规则命中记录** 可见 Policy 命中或 `[路由] xxx` 条目。
3. 跨租户规则与命中不可见。

---

## 实现差异

|----------|---------|
| 菜单在「知识库管理与规则」下 | **独立顶级「规则」** |
| 标注实验中 | **已去标注并产品化** |
| 仅 Policy 命中写 rule_hit | **补充路由级确认留痕**（无 Policy 命中时） |

