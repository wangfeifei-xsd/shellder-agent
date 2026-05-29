# 18-workbench — 工作台

## 阶段信息

| 属性 | 值 |
|------|-----|
| **执行序号** | 17 |
| **前置依赖** | 04（审计中心）、07（工具注册）、09（任务中心）、14（审批中心） |
| **功能清单** | §1.1 工作台 |

## 说明

本模块为**纯聚合读取模块**，不新增任何数据库表或索引。

工作台首页 Dashboard API（`GET /api/v1/dashboard/summary`）通过聚合查询以下前序模块已有表产生数据：

| 指标 | 数据来源 | 查询条件 |
|------|----------|----------|
| 工具成功率 / 失败率 / 平均响应时长 | `tool_call_audit`（阶段 04） | `created_at >= 7天前`，按 `status` 分组 |
| 高风险动作待确认列表 | `approval`（阶段 14） | `status = 'pending'`，Top 10 |
| 最近异常任务 | `task`（阶段 09） | `status IN ('failed', 'timeout')`，Top 10 |

所有查询均按租户隔离（`tenantId`），非超管仅可见其绑定租户数据。

## 文件清单

| 文件 | 说明 |
|------|------|
| `schema.sql` | 无新增表声明（附聚合查询说明注释） |
| `seed.sql` | 无初始化数据（附说明注释） |
| `README.md` | 本文件 |

## 依赖的前序 SQL

- `project-sql/04-audit-center/schema.sql` — `tool_call_audit` 表
- `project-sql/09-task-worker/schema.sql` — `task` 表
- `project-sql/15-approval-center/schema.sql` — `approval` 表

## 执行顺序

本模块无需执行 SQL 变更。确保前序模块 04、07、09、14 的 SQL 已执行即可。
