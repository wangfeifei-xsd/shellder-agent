# Shellder Agent 系统架构图

## 1. 总体架构

```mermaid
flowchart LR
    subgraph Client["客户端层"]
        Admin["Web Console\nVite + React + Ant Design"]
        CopilotWidget["Embedded Copilot Widget\n/cpilot 页面 or 业务系统 iframe"]
        BizApp["业务系统 / 第三方应用"]
    end

    subgraph Gateway["接入与应用层"]
        Server["shellder-agent-server\nNestJS REST + SSE"]
        OpenAPI["OpenAPI / Copilot BFF\n/openapi/v1 + /copilot/v1"]
    end

    subgraph Domain["平台核心域服务"]
        Auth["Auth + RBAC"]
        SessionMsg["Session / Message"]
        Runtime["Agent Runtime"]
        Routing["Capability Routing"]
        Policy["Policy Engine"]
        Approval["Approval Runtime"]
        BizCap["Business Capability\nqa/query/action/workflow"]
        TaskSvc["Task Service + Task Queue"]
        Knowledge["Knowledge Proxy"]
        Tooling["Tool / Connector / Skill"]
        Audit["Audit"]
        Settings["System Settings / Dashboard / Tenant"]
    end

    subgraph Async["异步执行层"]
        Redis["Redis / BullMQ"]
        Worker["shellder-job-worker\nNestJS Worker"]
        InternalAPI["Internal Task APIs\n/internal/tasks/*"]
    end

    subgraph Data["数据层"]
        MySQL["MySQL + Prisma"]
    end

    subgraph External["外部系统"]
        Pathy["Pathy Knowledge Server"]
        DBRO["业务只读库 / SQL Data Source"]
        HTTPBiz["业务 HTTP API / 通知系统"]
        Monitor["Prometheus / Loki / Grafana"]
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

    BizCap --> Knowledge
    BizCap --> Tooling
    BizCap --> TaskSvc

    TaskSvc --> Redis
    Worker --> Redis
    Worker --> InternalAPI
    InternalAPI --> BizCap
    InternalAPI --> Approval
    InternalAPI --> Audit

    Knowledge --> Pathy
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

    Server -.metrics/logs.-> Monitor
    Worker -.metrics/logs.-> Monitor
```

## 2. 后端模块关系

```mermaid
flowchart TD
    App["AppModule"]

    App --> Prisma["PrismaModule"]
    App --> Auth["AuthModule"]
    App --> Audit["AuditModule"]
    App --> Tenant["TenantModule"]
    App --> Rbac["RbacModule"]
    App --> Policy["PolicyModule"]
    App --> Connector["ConnectorModule"]
    App --> Tool["ToolModule"]
    App --> Session["SessionModule"]
    App --> Message["MessageModule"]
    App --> Task["TaskModule"]
    App --> Capability["CapabilityModule"]
    App --> Skill["SkillModule"]
    App --> Knowledge["KnowledgeModule"]
    App --> Approval["ApprovalModule"]
    App --> Runtime["AgentRuntimeModule"]
    App --> BizCap["BusinessCapabilityModule"]
    App --> OpenAPI["OpenApiModule"]
    App --> Copilot["CopilotModule"]
    App --> Dashboard["DashboardModule"]
    App --> Settings["SystemSettingsModule"]

    Runtime --> Policy
    Runtime --> Audit
    Runtime --> Capability
    Runtime --> Session
    Runtime --> Approval

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
    A["接入层\nWeb Console / OpenAPI / Copilot / REST / SSE"]
    B["编排层\nAgentRuntimeService / ApprovalRuntimeService / RoutingEngineService"]
    C["能力层\nQA / Query / Action / Workflow Handlers"]
    D["执行层\nSQL Tool / HTTP Action Tool / Workflow Task / Pathy Proxy"]
    E["治理层\nAuth / RBAC / Policy / Audit / Tenant Isolation"]
    F["基础设施层\nMySQL / Redis / BullMQ / Prisma / Monitoring"]

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

- `shellder-web-console` 是管理后台与预览前端，走 `/api/v1/*` 和 `/copilot/v1/*`。
- `shellder-agent-server` 是统一控制面与运行时入口，负责认证、会话、编排、审批、审计、OpenAPI、Copilot BFF。
- `shellder-job-worker` 只负责异步消费、状态机推进、重试与续跑；真实能力执行通过 `agent-server` 的 `/internal/tasks/*` 完成。
- `qa` 能力不在本地做向量检索，而是通过 `KnowledgeProxyService` 代理到 `Pathy`。
- `query` / `action` / `workflow` 通过 Tool + Connector 落到只读数据库或外部 HTTP 系统。
- `Policy` 与 `Approval` 嵌入 Runtime 主链路，在工具执行前决定放行、拒绝或转人工确认。
- `MySQL` 存放业务主数据、会话消息、任务、规则、审批、审计、Copilot 配置；`Redis` 承载 BullMQ 队列与异步任务。
