# 13-agent-runtime — Agent 运行时与流式响应

## 模块说明

本模块对应模块： Agent 运行时与流式响应**。

Agent Runtime 是平台的核心运行时引擎，负责：

- 意图承接
- 调用 Capability Routing 获取能力类型
- 上下文组织
- 工具选择与执行编排
- 结果汇总
- 重试与超时控制
- 人工确认中断
- SSE 流式事件推送

## 依赖的前序模块

| 序号 | 模块 | 说明 |
|------|------|------|
| 08 | session-message | session 表、message 表 |
| 09 | task-worker | task 表、task_step 表 |
| 10 | capability-routing | capability 表、routing_rule 表 |
| 11 | skill-management | skill 相关表 |
| 12 | knowledge-base | 知识库相关表 |

## 数据库变更

本阶段 **不新增表**，仅对已有表做增量枚举扩展：

1. `session.status` 枚举新增 `pending_confirm`
2. `task.status` 枚举新增 `pending_confirm`

## 执行顺序

```bash
# 在前序 01~12 模块 SQL 已执行的基础上
mysql -u root -p shellder_agent < schema.sql
# seed.sql 为空，无需执行
```

## 注意事项

- `pending_confirm` 状态用于人工确认中断场景：Agent Runtime 编排过程中遇到 `needConfirmation` 标记的 Tool 或路由规则时，将会话/任务状态设为 `pending_confirm`，等待人工确认后恢复执行。
- 恢复执行接口在 Phase 14（审批中心）完善。
- 本阶段运行时代码通过已有的 `session`、`message`、`task` 等表进行数据读写，不引入新的持久化结构。
