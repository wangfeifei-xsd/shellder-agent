# 14 — 四类业务能力

## 概述

本模块对应执行序号 13（四类业务能力），在 `shellder-agent-server` 中实现问答型、查询型、操作型、流程型四类能力的完整运行时编排。

## 依赖的前序模块

| 序号 | 模块 | 关系 |
|------|------|------|
| 07 | tool-registry | Tool 定义（query/action/workflow/notification）及配置 |
| 08 | session-message | 会话与消息存储 |
| 09 | task-worker | 任务状态化与步骤跟踪（流程型） |
| 10 | capability-routing | 能力目录与路由规则 |
| 11 | skill-management | 技能书绑定关系 |
| 12 | knowledge-base | 知识库检索（问答型） |
| 13 | agent-runtime | Agent 运行时编排骨架 |

## SQL 文件说明

### schema.sql

- 本阶段**无新建表**
- 增量变更：为 `task` 表添加组合索引 `idx_task_cap_type_status_created`，优化流程型任务进度查询
- 文档化统一结果结构的 JSON 约定（`message.content` 格式）

### seed.sql

- 本阶段**无初始化数据**
- 四类能力由运行时驱动，具体 Tool/连接器/知识库/路由规则由接入项目配置

## 统一结果结构

验收标准 5 要求统一结果结构：

```json
{
  "capabilityType": "qa | query | action | workflow",
  "data": { ... },
  "citations": [...],
  "steps": [...],
  "status": "success | failed | partial | pending_confirm"
}
```

## 执行顺序

```bash
mysql -u root -p shellder_agent < project-sql/14-business-capabilities/schema.sql
```

## 注意事项

- schema.sql 使用 `CREATE INDEX IF NOT EXISTS`，可重复执行
- 本阶段核心交付为代码层实现（四个 Capability Handler），SQL 层变更极少
- 不修改前序表结构；仅添加辅助索引
