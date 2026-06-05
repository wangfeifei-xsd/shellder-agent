# 20-embedded-copilot

## 概述

阶段 19 — 嵌入式 Copilot 的数据库增量变更。

## 作用

为可嵌入业务系统的 Copilot 组件提供配置存储，包括域名白名单、主题、功能开关等。

## 依赖的前序模块

| 序号 | 模块 | 依赖表 |
|------|------|--------|
| 02 | tenant-management | `tenant` |
| 16 | openapi | `openapi_app` |

## 新增表

| 表名 | 用途 |
|------|------|
| `copilot_config` | 每个 OpenAPI 应用的 Copilot 嵌入配置（主题、域名白名单、功能开关） |

## 执行顺序

```bash
mysql -u root -p agent_platform < project-sql/20-embedded-copilot/schema.sql
```

## 设计说明

1. **Copilot 不新建会话/消息表**：复用阶段 08 的 `session`/`message` 表，通过阶段 15 的 OpenAPI 接口交互。
2. **换票机制**：业务系统凭自有 Token 换取 Agent JWT，换票逻辑在代码层实现（JWT 签发），不存储中间态。
3. **copilot_config 与 openapi_app 一对一**：每个接入应用可配置独立的 Copilot 外观和功能。
4. **域名白名单**：iframe 嵌入时检查 `Referer`/`Origin`，不在白名单内拒绝加载。

## 注意事项

- `copilot_config.app_id` 为唯一键，一个 OpenAPI 应用只对应一份 Copilot 配置。
- 删除 OpenAPI 应用时级联删除 Copilot 配置（`ON DELETE CASCADE`）。
- `features` 字段 JSON 结构示例：`{"enableHistory": true, "enableTask": true, "enableConfirmation": true}`
