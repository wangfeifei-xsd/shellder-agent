# 模块：嵌入式 Copilot

| 属性 | 值 |
|------|-----|
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

## 功能

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

## 安全与隔离

| 维度 | V1 已落地 | 目标态（待强化，见 [01-范围与边界 §6](../01-范围与边界.md#6-已知缺口与后续强化)） |
|------|-----------|-------------------------------------------------------------------------------------|
| JWT | Copilot 独立 issuer，与管理端分离 | — |
| 会话 API | 校验 `session.userId === sub` | — |
| 待确认 / 任务 API | 仅校验 `tenantId` | 须校验会话或用户归属，禁止同租户跨用户操作他人审批与任务 |
| 嵌入域名 | `domainWhitelist` 可配置 | 换票 / Widget 请求须 enforcement |
| SSE Token | 支持 `?token=` 传 JWT | 避免长期 Token 出现在 URL |

多用户嵌入同一 `tenantId` 时，**必须**按上表补齐用户级隔离后再视为生产就绪。

---

## 实现差异

- 原建议独立 npm 包；V1 为 **web-console 内 `/copilot` 页 + BFF**
- 四项运行时功能在 Copilot 页内集成，非四个独立管理菜单
- 管理端「Copilot 配置」对应接入参数，非运行时菜单字面拆分
