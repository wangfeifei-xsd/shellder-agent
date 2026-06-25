# 15-approval-center — 审批中心

## 模块说明

本模块为阶段 14（审批中心）的数据库增量结构，对应人工确认中断。

## 新增表

| 表名       | 说明                                                       |
|------------|----------------------------------------------------------|
| `approval` | 审批记录表，记录高风险动作待确认事项的全生命周期               |

## 前序依赖

| 模块                     | 依赖关系                                |
|--------------------------|----------------------------------------|
| 02-tenant-management     | `approval.tenant_id → tenant.id`       |
| 08-session-message       | `approval.session_id` 关联 session      |
| 09-task-worker           | `approval.task_id` 关联 task            |
| 13-agent-runtime         | session/task 状态枚举已含 `pending_confirm` |

## 执行顺序

1. 确保 01 ~ 14 前序模块 SQL 已执行
2. 执行 `schema.sql`（建表 + 索引 + 外键）
3. 执行 `seed.sql`（本模块无种子数据）

## 字段说明

### approval 表

- `status` 状态流转：`pending` → `approved` | `rejected` | `timeout`
- `request_context`：运行时上下文快照 JSON，含 `userMessage`、`capabilityType`、`toolIds` 等
- `tool_ids`：待执行的 Tool ID 列表（JSON 数组）
- `risk_level`：风险等级，默认 `high`（仅高风险动作触发审批）
- `expired_at`：超时截止时间，由创建时 + 配置超时时长计算

## 与运行时联动

1. Tool `needConfirmation` 或规则命中 → 创建 `approval` 记录，session/task 状态 `pending_confirm`
2. 确认 → Runtime 从断点继续执行 Tool
3. 驳回 → 任务失败，Message 写入驳回原因
4. 超时 → `job-worker` 定时任务标记超时
