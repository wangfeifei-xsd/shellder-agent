# 11 — 技能书管理 SQL

## 作用

本模块实现技能书管理的数据库结构，包含以下四张表：

| 表名 | 用途 |
|------|------|
| `skill` | 技能书主表：定义、配置、状态、版本、绑定入口 |
| `skill_trigger` | 触发示例：关键词/意图/正则匹配文本 |
| `skill_binding` | 绑定关系：技能书与 Tool/Workflow/Connector 的关联 |
| `skill_execution_log` | 执行记录：技能书级调用历史与状态 |

## 依赖前序模块

- `01-bootstrap`：Prisma 基线
- `02-tenant-management`：`tenant` 表（`skill.tenant_id` 外键）
- `07-tool-registry`：`tool` 表（`skill.entry_tool_id`、`skill.workflow_tool_id` 引用，无硬外键）
- `10-capability-routing`：`CapabilityType` 枚举复用

## 执行顺序

```bash
mysql -u root -p shellder_agent < project-sql/11-skill-management/schema.sql
mysql -u root -p shellder_agent < project-sql/11-skill-management/seed.sql
```

## 注意事项

1. `skill.entry_tool_id` 和 `skill.workflow_tool_id` 未加硬外键约束（避免 Tool 删除级联影响技能书配置），应用层校验有效性。
2. `skill_execution_log.skill_id` 使用 `ON DELETE RESTRICT`，技能书有执行记录时不可直接删除（需先清理或归档日志）。
3. `capability_type` 枚举值与阶段 08 `session.capability_type`、阶段 10 `capability.type` 保持一致。
4. Prisma schema 中对应模型已同步更新（`Skill`、`SkillTrigger`、`SkillBinding`、`SkillExecutionLog`）。

## 与 Prisma schema 的一致性

本 SQL 与 `shellder-agent-server/prisma/schema.prisma` 中阶段 11 新增的模型定义保持一致。字段类型、索引、约束均已对齐。
