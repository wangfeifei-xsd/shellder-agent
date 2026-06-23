# 模块：嵌入式 Copilot

| 属性 | 值 |
|------|-----|
| 初始方案 | 功能清单 §2 / 执行计划 19 |
| 菜单 key | `copilot`（RBAC 映射 `openapi`） |

---

## 管理子菜单

| 子菜单 | 路由 |
|--------|------|
| Copilot 配置 | `/copilot-admin` |
| 嵌入预览 | `/copilot-admin/preview` |

## 实际嵌入页

| 路由 | 说明 |
|------|------|
| `/copilot` | 独立 Layout，业务系统 iframe 目标页 |

---

## 功能（§2 对齐）

| 能力 | 实现 |
|------|------|
| 多轮对话 | `/copilot/v1/sessions` |
| 流式回复 | SSE `/copilot/v1/sessions/:id/stream` |
| 四类能力 | Agent Runtime |
| 待确认 | `/copilot/v1/confirmations`；内联确认卡片 + `POST .../confirmations/:id` |
| 任务状态 | `/copilot/v1/tasks/:id` |
| 历史会话 | 会话列表 API |
| 规则命中留痕 | Runtime 路由级确认前写 `rule_hit`（见 [16-规则与Policy.md](./16-规则与Policy.md)） |

---

## 后端

| Controller | 前缀 | 鉴权 |
|------------|------|------|
| `CopilotConfigController` | `/api/v1/copilot/configs` | 管理 JWT |
| `CopilotWidgetController` | `/copilot/v1` | Copilot JWT（换票） |

换票：`POST /copilot/v1/auth/token`（clientId/secret 或 demo token）。

配置表：`copilot_config`（关联 `open_api_app`）。

---

## 接入要点

- 租户：`tenantId` 或 `externalTenantId` 映射
- 与 OpenAPI 共享 Runtime，**鉴权独立**
- **待确认 UX**（2026-06）：聊天气泡式 `InlineConfirmCard`；`approvalId` 缺失时从 `/confirmations` 补查；确认提交 `POST /copilot/v1/confirmations/:id`
- 路由级确认触发前 Runtime 写入 `rule_hit`（见 [16-规则与Policy.md](./16-规则与Policy.md)）
- 详见 `docs/embedded-copilot-sequence.md`

---

## 对照初始方案

- 初始建议独立 npm 包；V1 为 **web-console 内 `/copilot` 页 + BFF**
- §2 四项功能在 Copilot 页内集成，非四个独立管理菜单
- 管理端「Copilot 配置」对应接入参数，非 §2 运行时菜单字面拆分
