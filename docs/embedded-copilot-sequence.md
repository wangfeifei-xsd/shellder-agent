# 业务系统嵌入式 Copilot 时序图

## 1. 主时序图

```mermaid
sequenceDiagram
    autonumber
    participant U as 业务用户
    participant B as 业务系统前端
    participant S as 业务系统服务端
    participant C as Copilot BFF<br/>/copilot/v1
    participant OA as OpenAPI/Copilot Auth
    participant R as Agent Runtime
    participant RT as Routing Engine
    participant P as Policy Engine
    participant A as Approval Runtime
    participant H as Capability Handler
    participant DB as MySQL
    participant SSE as SSE Emitter
    participant EXT as 外部系统/知识库/工具

    U->>B: 打开嵌入式 Copilot
    B->>S: 请求业务系统自身登录态/用户信息
    S->>C: POST /copilot/v1/auth/token\n(clientId, clientSecret, tenantId, externalUserId)
    C->>OA: 校验 OpenAPI App + CopilotConfig + tenant
    OA->>DB: 查询 openapi_app / copilot_config / tenant
    DB-->>OA: 返回配置
    OA-->>C: 签发 Copilot JWT
    C-->>S: accessToken + widget config
    S-->>B: token + theme/features

    B->>C: POST /copilot/v1/sessions\nBearer Copilot JWT
    C->>DB: 创建 session
    DB-->>C: sessionId
    C-->>B: sessionId

    B->>C: GET /copilot/v1/sessions/:id/stream?token=...
    C->>DB: 读取历史 message/session
    C-->>B: session.connected / message* / session.snapshot_end
    C->>SSE: subscribe(sessionId)

    U->>B: 输入消息并发送
    B->>C: POST /copilot/v1/sessions/:id/messages
    C->>R: sendMessage()
    R->>DB: 写入 user message
    R->>RT: route(tenantId, userMessage, userId)
    RT->>DB: 查询 capability + routing_rule
    RT->>P: 检查路由级 needConfirm
    P->>DB: 查询 rule / permission policy
    P-->>RT: route decision
    RT-->>R: capabilityType + toolIds + needConfirmation
    R->>DB: 更新 session.capabilityType + 写 routing_result message

    alt 路由或策略要求确认
        R->>A: handleConfirmInterrupt()
        A->>DB: 写 approval + 更新 session/task 为 pending_confirm
        R->>SSE: emit confirm_required
        SSE-->>B: confirm_required
        B-->>U: 展示待确认动作
        U->>B: 批准/驳回
        B->>C: POST /copilot/v1/confirmations/:id
        C->>A: reviewByCopilot()
        A->>DB: 更新 approval 状态
        alt 批准
            A->>R: resumeFromApproval() 或重新入队 worker
            R->>H: 恢复后继续执行
        else 驳回
            A->>DB: 会话/任务置 failed
            A->>SSE: emit rejection result
        end
    else 直接执行
        R->>P: 对 toolIds 做执行前策略校验
        P->>DB: 读取规则
        P-->>R: allow
        R->>H: execute(ctx, emitSse)

        alt qa
            H->>EXT: Pathy dialogueRecall
            EXT-->>H: recall hits / context
        else query
            H->>EXT: 只读 SQL Tool / DB Connector
            EXT-->>H: rows
        else action
            H->>EXT: HTTP Action / Notification Connector
            EXT-->>H: response
        else workflow
            H->>DB: 创建 task / task_step / task_log
            H->>EXT: 子工具串行执行
        end

        H->>SSE: delta / tool_start / tool_end
        SSE-->>B: 增量流式消息
        H-->>R: handler result
        R->>DB: 写 assistant message / task result / audit
        R->>SSE: emit done
        SSE-->>B: done
        B-->>U: 展示回答/任务结果
    end
```

## 2. 异步 Workflow/Worker 续跑时序

```mermaid
sequenceDiagram
    autonumber
    participant R as Agent Runtime
    participant DB as MySQL
    participant Q as TaskQueueService
    participant Redis as BullMQ/Redis
    participant W as Job Worker
    participant I as Internal Task API
    participant H as Workflow/Step Handler
    participant A as Approval Runtime

    R->>DB: 创建 async task / task_step
    R->>Q: enqueue(taskId, tenantId)
    Q->>Redis: add job
    Redis-->>W: deliver job

    W->>DB: 读取 task 状态
    W->>I: POST /internal/tasks/:taskId/prepare
    I->>DB: 物化 workflow steps
    W->>I: POST /internal/tasks/:taskId/steps/:stepId/execute
    I->>H: 执行具体 step / sub-tool

    alt step 需要审批
        H->>A: 创建 approval
        A->>DB: task/session -> pending_confirm
        I-->>W: needConfirmation + approvalId
        W->>DB: 记录 task_log
    else step 成功
        H-->>I: output
        I-->>W: success
        W->>DB: 更新 task_step / task_log
    end

    alt 审批通过
        A->>Q: enqueue(taskId, tenantId)
        Q->>Redis: requeue
        Redis-->>W: 续跑任务
    end

    W->>DB: task completed/failed
```

## 3. 时序说明

- 嵌入式 Copilot 本质是 `Copilot BFF`，不自带独立运行时；会话、消息、SSE、确认都复用 `AgentRuntimeService` 与 `ApprovalRuntimeService`。
- 换票入口依赖 `openapi_app` 与 `copilot_config`，说明 Copilot 是建立在 OpenAPI 接入应用之上的能力扩展。
- SSE 连接先回放历史快照，再订阅实时事件；前端应先连 `stream`，再发 `messages`。
- 审批通过后有两条恢复路径：同步 `resumeFromApproval()`，或异步重新入队 `job-worker` 续跑。
- `workflow` 的长任务会落到 `task/task_step/task_log`，因此业务系统可以通过 `/copilot/v1/tasks/:id` 持续查询进度。
