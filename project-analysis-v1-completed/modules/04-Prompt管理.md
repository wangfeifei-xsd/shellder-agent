# 模块：Prompt 管理

| 属性 | 值 |
|------|-----|
| 初始方案 | 功能清单 §1.14 / `Prompt管理-方案.md` / 执行计划 21 |
| 菜单 | Prompt 管理 / 模板列表 |
| 路由 | `/prompts`、`/prompts/:id` |

---

## 功能（V1 已验收）

| 能力 | 说明 |
|------|------|
| 模板列表 | 搜索 category/scope/key；展示 published 版本 |
| 模板详情 | 元数据、版本时间线 |
| 版本管理 | 新建 draft、编辑、发布、回滚、deprecated |
| 试跑 | `POST /api/v1/prompts/render`；`render/test-llm`（需 `prompt:debug`） |
| 绑定 | `prompt_binding` CRUD |

初始方案中的「版本对比、绑定配置」等 **合并在详情页**，无独立侧栏项。

---

## 后端

| 组件 | 路径 |
|------|------|
| Controller | `prompt/prompt.controller.ts` |
| Resolver | `prompt/prompt-resolver.service.ts` |
| Keys 注册 | `prompt/prompt-keys.ts` |
| API 前缀 | `/api/v1/prompts` |
| 权限 | `@RequireMenu('prompt')` + `prompt:read/write/publish/debug` |

---

## 预置 prompt_key（V1）

| Key | 消费方 |
|-----|--------|
| `qa.dialogue.system` | QaPipelineService |
| `query.nl2sql.system` / `.user` | Nl2SqlService |
| `query.result.system` / `.user` | QueryResultService |
| `connector.er_diagram.*` | ErDiagramService |
| `connector.er_data_scope.*` | ErDataScopeService |

---

## 硬约束

- Runtime **仅** `published`
- 业务代码禁止 Prompt 正文（见 `06-实施约束-已落地.md`）
- 改文案 → Prompt 管理发布，**非**改 `*.ts` 字符串

---

## 对照初始方案

- 菜单简化为列表 + 详情；功能点与 §1.14 对齐
- 21-B「全链路迁移」：Query/ER/QA 主路径已走 Resolver；新增 key 须同步 seed
