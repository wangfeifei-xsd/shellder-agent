# 21-prompt-management — Prompt 管理

> **执行序号**：21（子阶段 21-A）  
> **方案**：[`Prompt管理-方案.md`](../../../project-analysis/Prompt管理-方案.md)

## 本模块作用

为全平台 LLM 提示词提供统一注册、版本化、运行时解析（`PromptResolver`）与管理后台运维能力。

## 依赖的前序模块

| 模块 | 依赖关系 |
|------|----------|
| 02-tenant-management | `prompt_template.tenant_id`、`prompt_binding.tenant_id` |
| 03-user-rbac | 菜单 `prompt`、模块权限 `prompt:*` |
| 04-audit-center | 发布/回滚审计 |
| 18-system-settings | 试跑 LLM 依赖 `LlmService` / 模型接入 |

## 新增表

| 表名 | 说明 |
|------|------|
| `prompt_template` | 逻辑模板元数据（`prompt_key`、category、scope） |
| `prompt_version` | 不可变版本正文与发布状态 |
| `prompt_binding` | 业务对象 → `prompt_key` 绑定 |

## 执行顺序

```bash
mysql -u root -p agent_platform < schema.sql
mysql -u root -p agent_platform < seed.sql
```

## 注意事项

- V1 seed 导入 §4.1 八个 `prompt_key` 的 **published v1**，正文自现有 `*.prompt.ts` / `QaPipelineService` 迁移。
- 21-A **不**切换 Query/QA/ER 业务链路；Runtime 仍读代码内常量，Resolver 供管理端试跑与 21-B 迁移使用。
- 每 `template_id` 至多一个 `published` 版本；发布新版本时旧 published 自动 `deprecated`。
