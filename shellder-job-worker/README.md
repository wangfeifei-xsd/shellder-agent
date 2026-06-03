# shellder-job-worker

BullMQ 异步 Worker：长任务、超时检查、异步通知、wiki 文档处理。

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

## 队列一览

| 队列名 | Processor | 说明 |
|--------|-----------|------|
| `shellder.task` | `TaskProcessor` | 长任务状态机 |
| `shellder.task-timeout` | `TaskTimeoutProcessor` | 审批/任务超时 |
| `shellder.notification` | `NotificationProcessor` | 异步通知（模板 + 连接器/Mock） |
| `shellder.document-processing` | `DocumentProcessingProcessor` | wiki 编译 raw→wiki + wiki/embed |

### `shellder.notification` payload

```json
{
  "type": "task_completed | approval_pending | error",
  "tenantId": "uuid",
  "templateKey": "默认任务完成通知模板",
  "variables": { "taskTitle": "...", "taskStatus": "completed" },
  "taskId": "optional",
  "approvalId": "optional"
}
```

- 入队：`ApprovalService.create`（审批）、worker 完成后 `POST /internal/tasks/:id/lifecycle/completed|failed`
- 幂等：Bull `jobId` = `notify:{type}:{taskId}`；已写入 `task_log`（type=notification, sendStatus=sent|mock）则跳过
- Mock：默认开启；`NOTIFICATION_SEND_MOCK=false` 且配置 `notification.connectorId` 时走 HTTP POST

### `shellder.document-processing` payload

```json
{
  "jobRecordId": "uuid",
  "tenantId": "uuid",
  "layer": "raw | wiki",
  "inputPath": "tenants/.../notes/foo.md",
  "outputPath": "tenants/.../notes/foo.md",
  "operation": "compile_and_embed | embed_only",
  "idempotencyKey": "tenantId:layer:path"
}
```

- 入队：`POST /api/v1/knowledge/layers/:layer/upload` 成功后（`.md` 的 raw/wiki 层）
- 状态表：`kb_layer_processing_job`（queued → running → done/failed）
- 依赖：MySQL `system_config` 中 `knowledge.wikiBaseUrl`（知识库管理页配置）、wiki `POST /api/v1/tasks/compile` 与 `POST /api/v1/wiki/embed`

### 环境变量（补充）

```bash
DATABASE_URL=mysql://...             # 读取 knowledge.wikiBaseUrl 等 system_config
NOTIFICATION_SEND_MOCK=true          # 默认 Mock 日志发送
CONNECTOR_SECRET_KEY=...             # 真实通知连接器解密
```

### 本地验证

```bash
# 终端 1：server + worker + Redis + MySQL + wiki 服务（文档处理可选）
npm run dev:server -w shellder-agent
npm run dev:worker -w shellder-job-worker

# 1) 任务完成通知：创建异步任务并等待 completed → GET /api/v1/tasks/:id/logs 含 notification 条目
# 2) 审批通知：触发需确认的步骤 → 审批列表新增记录，worker 日志 [Mock通知] approval_pending
# 3) 文档处理：向 raw 层上传 .md → SELECT * FROM kb_layer_processing_job 终态 done
# 4) 幂等：重启 worker 后重复 Job 不重复发送（通知 task_log / 文档 job 表 status=done）
```
