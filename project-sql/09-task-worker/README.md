# 09 — 任务中心与异步 Worker

## 模块说明

本模块实现 Task 模块数据结构，包含任务（task）、任务步骤（task_step）、任务执行日志（task_log）三张表。

对应功能清单 §1.3 任务中心、§4.3 Task、§4.11 异步执行（job-worker）。

## 依赖的前序模块

| 序号 | 模块 | 依赖关系 |
|------|------|----------|
| 02 | 租户管理 | `task.tenant_id → tenant.id` |
| 08 | 会话与消息核心 | `task.session_id` 引用 session（逻辑关联，非外键） |

## 新增表

| 表名 | 说明 |
|------|------|
| `task` | 任务主表：创建、状态推进、长任务跟踪、输入/输出 |
| `task_step` | 任务步骤：流程型/异步型任务的步骤明细与进度 |
| `task_log` | 执行日志：工具调用、状态变更、异常堆栈、人工确认记录 |

## 执行顺序

1. 确保 `01-bootstrap` 至 `08-session-message` 已执行
2. 执行 `schema.sql` 创建表结构
3. 执行 `seed.sql`（本模块无初始化数据）

## 设计要点

- `task.tenant_id` 外键 Restrict：任务为保留性数据，租户只禁用不删除
- `task_step` / `task_log` 级联删除（Cascade）：跟随任务清理
- `task.session_id` 为逻辑关联，不设外键：任务可独立于会话创建（如定时任务）
- `task.job_id` 记录 BullMQ Job ID，供 Worker 状态关联
- 任务状态包含 `timeout`：由 Worker 定时超时检查标记
- 日志类型（type）覆盖：状态变更、工具调用、异常、人工确认、异步通知、重试

## 与 Prisma schema 一致性

本 SQL 与 `shellder-agent-server/prisma/schema.prisma` 中阶段 09 新增模型（Task / TaskStep / TaskLog）保持一致。
