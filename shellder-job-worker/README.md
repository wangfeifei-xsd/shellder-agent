# shellder-job-worker

BullMQ 异步 Worker，消费 `TASK_QUEUE` 驱动长任务状态机。

## 与 agent-server 的职责边界（方案 B）

| 组件 | 职责 |
|------|------|
| **job-worker** | 队列消费、任务/步骤状态推进、幂等续跑（跳过已完成步骤）、`task_log` 状态类日志、失败重试（`retryCount` / `maxRetries`）、`pending_confirm` 挂起 |
| **agent-server** `/internal/tasks/*` | 四类业务能力 Handler、Workflow 子 Tool（SQL/HTTP）、审批创建、工具调用审计与 `task_log` 工具类日志 |

Worker **不**直接 import server 的 Nest Handler（避免双进程 DI 重复与循环依赖）；通过内网 HTTP + 共享 `WORKER_INTERNAL_TOKEN` 调用 server。

### 内网接口

- `POST /internal/tasks/:taskId/prepare` — 从 Workflow Tool 物化 `task_step`
- `POST /internal/tasks/:taskId/steps/:stepId/execute` — 执行单步
- `POST /internal/tasks/:taskId/execute-capability` — 无步骤时按 `capabilityType` 执行整能力

### 环境变量

```bash
AGENT_SERVER_INTERNAL_URL=http://127.0.0.1:3001   # 默认 AGENT_SERVER_PORT
WORKER_INTERNAL_TOKEN=change-me-worker-token      # 与 server 保持一致
```

### pending_confirm 续跑

步骤需人工确认时：worker 将任务置为 `pending_confirm` 并正常结束 Job；审批通过后 `ApprovalRuntimeService` 重新入队，worker 跳过已完成步骤继续执行。

### 本地验证

```bash
# 终端 1：server + worker + Redis + MySQL
npm run dev:server -w shellder-agent
npm run dev:worker -w shellder-job-worker

# 创建带 workflowToolId 的异步任务（或通过管理端任务中心）
# 观察 task_step 状态推进与 GET /api/v1/tasks/:id/logs 中的 tool_call / state_change
```
