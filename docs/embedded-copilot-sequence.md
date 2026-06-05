# 业务系统嵌入式 Copilot（智能副驾）时序图

## 1. 主时序图

```mermaid
sequenceDiagram
    autonumber
    participant U as 业务用户
    participant B as 业务系统前端
    participant S as 业务系统服务端
    participant C as Copilot BFF（前端聚合后端） /copilot/v1
    participant OA as OpenAPI（开放接口）认证
    participant R as Agent Runtime（智能体运行时）
    participant RT as Routing Engine（路由引擎）
    participant P as Policy Engine（策略引擎）
    participant A as Approval Runtime（审批运行时）
    participant QP as QA Pipeline（问答流水线）
    participant H as Capability Handler（能力处理器）
    participant LLM as 平台 LLM（大语言模型）服务
    participant DB as MySQL（关系数据库）
    participant SSE as SSE Emitter（服务端事件推送器）
    participant EXT as 外部系统 / 知识库 / 工具

    U->>B: 打开嵌入式 Copilot（智能副驾）
    B->>S: 请求业务系统自身登录态/用户信息
    S->>C: POST /copilot/v1/auth/token\n（clientId, clientSecret, tenantId, externalUserId, scopeList 数据范围）
    C->>OA: 校验 OpenAPI App（应用）+ CopilotConfig（副驾配置）+ tenant（租户）
    OA->>DB: 查询 openapi_app（开放应用）/ copilot_config（副驾配置）/ tenant（租户）
    DB-->>OA: 返回配置
    OA-->>C: 签发 Copilot JWT（身份令牌）
    C-->>S: accessToken（访问令牌）+ widget config（组件配置）
    S-->>B: token（令牌）+ theme/features（主题/功能开关）

    B->>C: POST /copilot/v1/sessions\nBearer Copilot JWT（持令牌访问）
    C->>DB: 创建 session（会话）
    DB-->>C: sessionId（会话标识）
    C-->>B: sessionId（会话标识）

    B->>C: GET /copilot/v1/sessions/:id/stream?token=...
    C->>DB: 读取历史 message（消息）/ session（会话）
    C-->>B: session.connected（会话已连接）/ message（消息）/ session.snapshot_end（快照结束）
    C->>SSE: subscribe(sessionId)（订阅会话事件）

    U->>B: 输入消息并发送
    B->>C: POST /copilot/v1/sessions/:id/messages
    C->>R: sendMessage()（发送消息）
    R->>DB: 写入 user message（用户消息）
    R->>RT: route(tenantId, userMessage, userId)（路由）
    RT->>DB: 查询 capability（能力）+ routing_rule（路由规则）
    RT->>P: 检查路由级 needConfirm（是否需要确认）
    P->>DB: 查询 rule（规则）/ permission policy（权限策略）
    P-->>RT: route decision（路由决策）
    RT-->>R: capabilityType（能力类型）+ toolIds（工具标识列表）+ needConfirmation（是否需要确认）
    R->>DB: 更新 session.capabilityType（会话能力类型）+ 写 routing_result message（路由结果消息）

    alt 路由或策略要求确认
        R->>A: handleConfirmInterrupt()（处理确认中断）
        A->>DB: 写 approval（审批记录）+ 更新 session/task（会话/任务）为 pending_confirm（待确认）
        R->>SSE: emit confirm_required（发出需要确认事件）
        SSE-->>B: confirm_required（需要确认）
        B-->>U: 展示待确认动作
        U->>B: 批准/驳回
        B->>C: POST /copilot/v1/confirmations/:id
        C->>A: reviewByCopilot()（副驾侧审批）
        A->>DB: 更新 approval（审批）状态
        alt 批准
            A->>R: resumeFromApproval()（从审批恢复）或重新入队 worker（工作进程）
            R->>H: 恢复后继续执行
        else 驳回
            A->>DB: 会话/任务置 failed（失败）
            A->>SSE: emit rejection result（发出驳回结果）
        end
    else 直接执行
        R->>P: 对 toolIds（工具标识列表）做执行前策略校验
        P->>DB: 读取规则
        P-->>R: allow（允许）
        R->>H: execute(ctx, emitSse)（执行）

        alt QA（问答）
            H->>QP: runStream()（流式运行）
            QP->>EXT: wiki dialogueRecall（对话召回）
            EXT-->>QP: recall hits（召回结果）/ injected_context（注入上下文）
            QP->>LLM: chatCompletionStream(messages)（聊天补全流）
            LLM->>EXT: 调用 OpenAI-compatible Chat Completions（兼容式聊天补全接口）
            EXT-->>LLM: token stream（词元流）
            LLM-->>QP: delta callback（增量回调）
            QP-->>H: replyText（回复文本）+ citations（引用）+ model（模型）
        else Query（查询）
            H->>EXT: 只读 SQL Tool（SQL 工具）/ DB Connector（数据库连接器）
            EXT-->>H: rows（结果行）
        else Action（动作）
            H->>EXT: HTTP Action（HTTP 动作）/ Notification Connector（通知连接器）
            EXT-->>H: response（响应）
        else Workflow（工作流）
            H->>DB: 创建 task（任务）/ task_step（任务步骤）/ task_log（任务日志）
            H->>EXT: 子工具串行执行
        end

        H->>SSE: delta（增量）/ tool_start（工具开始）/ tool_end（工具结束）
        SSE-->>B: 增量流式消息
        H-->>R: handler result（处理结果）
        R->>DB: 写 assistant message（助手消息）/ task result（任务结果）/ audit（审计）
        R->>SSE: emit done（发出完成事件）
        SSE-->>B: done（完成）
        B-->>U: 展示回答/任务结果
    end
```

## 2. 异步 Workflow/Worker 续跑时序

```mermaid
sequenceDiagram
    autonumber
    participant R as Agent Runtime（智能体运行时）
    participant DB as MySQL（关系数据库）
    participant Q as TaskQueueService（任务队列服务）
    participant Redis as BullMQ / Redis（队列与缓存）
    participant W as Job Worker（任务工作进程）
    participant I as Internal Task API（内部任务接口）
    participant H as Workflow / Step Handler（工作流 / 步骤处理器）
    participant A as Approval Runtime（审批运行时）

    R->>DB: 创建 async task（异步任务）/ task_step（任务步骤）
    R->>Q: enqueue(taskId, tenantId)（入队）
    Q->>Redis: add job（添加任务）
    Redis-->>W: deliver job（投递任务）

    W->>DB: 读取 task（任务）状态
    W->>I: POST /internal/tasks/:taskId/prepare
    I->>DB: 物化 workflow steps（工作流步骤）
    W->>I: POST /internal/tasks/:taskId/steps/:stepId/execute
    I->>H: 执行具体 step（步骤）/ sub-tool（子工具）

    alt step（步骤）需要审批
        H->>A: 创建 approval（审批）
        A->>DB: task/session（任务/会话）更新为 pending_confirm（待确认）
        I-->>W: needConfirmation（需要确认）+ approvalId（审批标识）
        W->>DB: 记录 task_log（任务日志）
    else step（步骤）成功
        H-->>I: output（输出）
        I-->>W: success（成功）
        W->>DB: 更新 task_step（任务步骤）/ task_log（任务日志）
    end

    alt 审批通过
        A->>Q: enqueue(taskId, tenantId)（重新入队）
        Q->>Redis: requeue（再次入队）
        Redis-->>W: 续跑任务
    end

    W->>DB: task（任务）completed/failed（完成/失败）
```

## 3. 时序说明

- 嵌入式 Copilot（智能副驾）本质是 `Copilot BFF`（Backend For Frontend，前端聚合后端），不自带独立运行时；会话、消息、SSE（Server-Sent Events，服务端发送事件）、确认都复用 `AgentRuntimeService`（智能体运行时服务）与 `ApprovalRuntimeService`（审批运行时服务）。
- 换票入口依赖 `openapi_app`（开放应用）与 `copilot_config`（副驾配置），说明 Copilot（智能副驾）是建立在 OpenAPI（开放接口）接入应用之上的能力扩展。
- SSE（Server-Sent Events，服务端发送事件）连接先回放历史快照，再订阅实时事件；前端应先连 `stream`（流式通道），再发 `messages`（消息）。
- QA（Question Answering，问答）能力当前真实链路是 `wiki recall -> platform LLM stream`（wiki 召回到平台 LLM 流式生成）；SSE 的 `delta`（增量片段）来自平台 LLM（Large Language Model，大语言模型）的流式输出，不再是本地 `splitText`（文本切分）模拟流式。
- 审批通过后有两条恢复路径：同步 `resumeFromApproval()`（从审批恢复），或异步重新入队 `job-worker`（任务工作进程）续跑。
- `workflow`（工作流）的长任务会落到 `task/task_step/task_log`（任务/任务步骤/任务日志），因此业务系统可以通过 `/copilot/v1/tasks/:id` 持续查询进度。
- 管理后台问答测试页走 `/api/v1/knowledge/dialogue/qa-preview`，与 Runtime（运行时）共用 `QaPipelineService`（问答流水线服务），因此图中的 QA（问答）两阶段链路同样适用于测试页。
