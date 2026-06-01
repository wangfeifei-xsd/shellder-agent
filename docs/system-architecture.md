# Shellder Agent（智能体平台）系统架构图

## 1. 总体架构

```mermaid
flowchart LR
    subgraph Client["客户端层"]
        Admin["Web Console（管理控制台）\nVite（前端构建工具） + React（前端界面框架） + Ant Design（蚂蚁设计组件库）"]
        CopilotWidget["Embedded Copilot Widget（嵌入式副驾组件）\n/cpilot 页面或业务系统 iframe（内嵌框架）"]
        BizApp["业务系统 / Third-party App（第三方应用）"]
    end

    subgraph Gateway["接入与应用层"]
        Server["shellder-agent-server\nNestJS（Node.js 服务端框架） + REST（表述性接口） + SSE（服务端发送事件）"]
        OpenAPI["OpenAPI（开放接口）/ Copilot BFF（前端聚合后端）\n/openapi/v1 + /copilot/v1"]
    end

    subgraph Domain["平台核心域服务"]
        Auth["Auth（认证）+ RBAC（基于角色的访问控制）"]
        SessionMsg["Session / Message（会话 / 消息）"]
        Runtime["Agent Runtime（智能体运行时）"]
        Routing["Capability Routing（能力路由）"]
        Policy["Policy Engine（策略引擎）"]
        Approval["Approval Runtime（审批运行时）"]
        LLM["LlmModule / LlmService（大语言模型模块 / 服务）"]
        BizCap["Business Capability（业务能力）\nQA（问答）/ Query（查询）/ Action（动作）/ Workflow（工作流）"]
        QaPipeline["QaPipelineService（问答流水线服务）\nRecall（召回） -> LLM（大语言模型）"]
        TaskSvc["Task Service（任务服务）+ Task Queue（任务队列）"]
        Knowledge["Knowledge Proxy（知识代理）"]
        Tooling["Tool / Connector / Skill（工具 / 连接器 / 技能）"]
        Audit["Audit（审计）"]
        Settings["System Settings / Dashboard / Tenant（系统设置 / 看板 / 租户）"]
    end

    subgraph Async["异步执行层"]
        Redis["Redis（内存数据库） / BullMQ（任务队列库）"]
        Worker["shellder-job-worker\nNestJS Worker（NestJS 工作进程）"]
        InternalAPI["Internal Task APIs（内部任务接口）\n/internal/tasks/*"]
    end

    subgraph Data["数据层"]
        MySQL["MySQL（关系数据库） + Prisma（数据库访问框架）"]
    end

    subgraph External["外部系统"]
        Pathy["Pathy Knowledge Server（知识服务）"]
        UpstreamLLM["OpenAI-Compatible LLM API（兼容 OpenAI 的大模型接口）"]
        DBRO["业务只读库 / SQL Data Source（SQL 数据源）"]
        HTTPBiz["业务 HTTP API（业务 HTTP 接口）/ 通知系统"]
        Monitor["Prometheus（指标监控） / Loki（日志系统） / Grafana（可视化看板）"]
    end

    Admin --> Server
    CopilotWidget --> OpenAPI
    BizApp --> OpenAPI
    OpenAPI --> Server

    Server --> Auth
    Server --> SessionMsg
    Server --> Runtime
    Server --> Tooling
    Server --> Settings
    Server --> Audit

    Runtime --> Routing
    Runtime --> Policy
    Runtime --> Approval
    Runtime --> BizCap
    Runtime --> SessionMsg
    Runtime --> Audit

    BizCap --> QaPipeline
    QaPipeline --> Knowledge
    QaPipeline --> LLM
    BizCap --> Knowledge
    BizCap --> LLM
    BizCap --> Tooling
    BizCap --> TaskSvc

    TaskSvc --> Redis
    Worker --> Redis
    Worker --> InternalAPI
    InternalAPI --> BizCap
    InternalAPI --> Approval
    InternalAPI --> Audit

    Knowledge --> Pathy
    LLM --> UpstreamLLM
    Tooling --> DBRO
    Tooling --> HTTPBiz

    Server --> MySQL
    Worker --> MySQL
    Auth --> MySQL
    SessionMsg --> MySQL
    Routing --> MySQL
    Policy --> MySQL
    Approval --> MySQL
    Tooling --> MySQL
    Audit --> MySQL
    TaskSvc --> MySQL

    Server -->|metrics / logs（指标 / 日志）| Monitor
    Worker -->|metrics / logs（指标 / 日志）| Monitor
```

## 2. 后端模块关系

```mermaid
flowchart TD
    App["AppModule（应用模块）"]

    App --> Prisma["PrismaModule（Prisma 数据库访问模块）"]
    App --> Auth["AuthModule（认证模块）"]
    App --> Audit["AuditModule（审计模块）"]
    App --> Tenant["TenantModule（租户模块）"]
    App --> Rbac["RbacModule（角色权限模块）"]
    App --> Policy["PolicyModule（策略模块）"]
    App --> Connector["ConnectorModule（连接器模块）"]
    App --> Tool["ToolModule（工具模块）"]
    App --> Session["SessionModule（会话模块）"]
    App --> Message["MessageModule（消息模块）"]
    App --> Task["TaskModule（任务模块）"]
    App --> Capability["CapabilityModule（能力模块）"]
    App --> Skill["SkillModule（技能模块）"]
    App --> Knowledge["KnowledgeModule（知识模块）"]
    App --> Approval["ApprovalModule（审批模块）"]
    App --> Runtime["AgentRuntimeModule（智能体运行时模块）"]
    App --> LLM["LlmModule（大语言模型模块）"]
    App --> BizCap["BusinessCapabilityModule（业务能力模块）"]
    App --> OpenAPI["OpenApiModule（开放接口模块）"]
    App --> Copilot["CopilotModule（智能副驾模块）"]
    App --> Dashboard["DashboardModule（看板模块）"]
    App --> Settings["SystemSettingsModule（系统设置模块）"]

    Runtime --> Policy
    Runtime --> Audit
    Runtime --> Capability
    Runtime --> Session
    Runtime --> Approval

    BizCap --> LLM
    BizCap --> Knowledge
    BizCap --> Tool
    BizCap --> Audit

    Copilot --> OpenAPI
    Copilot --> Runtime
    Copilot --> Auth

    OpenAPI --> Runtime
    OpenAPI --> Approval

    Task --> Runtime
    Task --> Approval
```

## 3. 关键职责分层

```mermaid
flowchart TB
    A["接入层\nWeb Console（管理控制台）/ OpenAPI（开放接口）/ Copilot（智能副驾）/ REST（表述性接口）/ SSE（服务端发送事件）"]
    B["编排层\nAgentRuntimeService（智能体运行时服务）/ ApprovalRuntimeService（审批运行时服务）/ RoutingEngineService（路由引擎服务）"]
    C["能力层\nQA（问答）/ Query（查询）/ Action（动作）/ Workflow Handlers（工作流处理器）+ QaPipeline（问答流水线）"]
    D["执行层\nPlatform LLM（平台大语言模型）/ SQL Tool（SQL 工具）/ HTTP Action Tool（HTTP 动作工具）/ Workflow Task（工作流任务）/ Pathy Recall Proxy（Pathy 召回代理）"]
    E["治理层\nAuth（认证）/ RBAC（基于角色的访问控制）/ Policy（策略）/ Audit（审计）/ Tenant Isolation（租户隔离）"]
    F["基础设施层\nMySQL / Redis / BullMQ / Prisma / Monitoring（监控）"]

    A --> B
    B --> C
    C --> D
    B --> E
    C --> E
    A --> E
    D --> F
    E --> F
    B --> F
```

## 4. 架构解读

- `shellder-web-console`（管理控制台）是管理后台与预览前端，技术栈为 Vite（前端构建工具）、React（前端界面框架）与 Ant Design（蚂蚁设计组件库），走 `/api/v1/*` 和 `/copilot/v1/*`。
- `shellder-agent-server`（智能体服务端）是统一控制面与运行时入口，负责认证、会话、编排、审批、审计、OpenAPI（开放接口）、Copilot BFF（前端聚合后端）。
- `shellder-job-worker`（任务工作进程）只负责异步消费、状态机推进、重试与续跑；底层依赖 BullMQ（任务队列库）与 Redis（内存数据库），真实能力执行通过 `agent-server`（智能体服务端）的 `/internal/tasks/*` 完成。
- `LlmModule`（大语言模型模块）提供平台级 OpenAI-compatible（兼容 OpenAI）模型接入，配置入口是 `/api/v1/settings/llm`，配置保存在平台侧 `system_config`（系统配置），不代理 `pathy`（知识服务）的 LLM（Large Language Model，大语言模型）设置。
- `qa`（问答）能力已经改为两阶段：`KnowledgeProxyService.dialogueRecall -> QaPipelineService -> LlmService`，即“知识召回服务 -> 问答流水线服务 -> 大语言模型服务”。也就是说 `pathy`（知识服务）只负责召回，最终回答由平台 LLM（大语言模型）生成。
- `query`（查询）/ `action`（动作）/ `workflow`（工作流）通过 Tool（工具）+ Connector（连接器）落到只读数据库或外部 HTTP（HyperText Transfer Protocol，超文本传输协议）系统。
- `Policy`（策略）与 `Approval`（审批）嵌入 Runtime（运行时）主链路，在工具执行前决定放行、拒绝或转人工确认。
- 管理端 `knowledge/recall-test`（召回测试）现在走 `qa-preview`（问答预览）两阶段链路，与 Runtime（运行时）的 QA（问答）行为保持一致。
- `MySQL`（关系数据库）存放业务主数据、会话消息、任务、规则、审批、审计、Copilot（智能副驾）配置及平台 LLM（大语言模型）配置；`Redis`（内存数据库）承载 BullMQ（任务队列库）队列与异步任务；监控侧使用 Prometheus（指标监控）、Loki（日志系统）与 Grafana（可视化看板）。
