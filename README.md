# shellder-agent

本目录为 **shellder-agent 可运行代码 Monorepo 根目录**（推 GitHub / 本地 `npm` / `docker compose` 均在此执行）。

Monorepo 包含 Web 管理后台（`shellder-web-console`）、主后端（`shellder-agent-server`）、异步 Worker（`shellder-job-worker`）。产品/架构文档见上级目录 [`project-analysis`](../project-analysis/)。

## 工程结构

| 目录 | 说明 |
|------|------|
| `shellder-web-console` | Vite + React Router + Ant Design 管理后台（CSR SPA） |
| `shellder-agent-server` | NestJS + Prisma 主 API |
| `shellder-job-worker` | NestJS + BullMQ 异步任务 |
| `project-sql/` | 按模块交付的 SQL 演进目录 |

## 前置要求

- Node.js ≥ 20
- npm 10+（随 Node 自带即可）
- Docker & Docker Compose（MySQL / Redis；方式一也可起三端应用）

> 以下命令均在 **`shellder-agent` 目录**执行（`cd shellder-agent`）。

---

## 本地启动流程

### 方式一：Docker 部署（外置 MySQL / Redis）

**默认行为**：`docker compose up` 只启动三个应用容器，**不会**创建 mysql/redis。连接地址来自仓库内的 **`.env.example`**（Jenkins scp 会一并下发，无需再维护单独的 `.env`）。

```bash
# 按需编辑 .env.example 中的 DATABASE_URL、REDIS_HOST 等
docker compose --env-file .env.example up --build -d
# 或 Jenkins：bash scripts/deploy.sh
```

`shellder-agent-server` 启动顺序：**Prisma 迁移** → **可选 seed**（`SEED_ON_STARTUP=true` 时）→ 应用进程。生产环境请保持 `SEED_ON_STARTUP=false`。

验证：

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
open http://localhost:3000/login
```

停止：`docker compose down`

Jenkins 远程脚本：

```bash
scp -r ./ 10.30.20.222:/data/shellder-agent
ssh 10.30.20.222 'cd /data/shellder-agent && bash scripts/deploy.sh'
```

故障排查：

```bash
docker logs --tail 200 shellder-agent-server
curl http://localhost:3001/health/live
curl http://localhost:3001/health
```

---

### 方式一（可选）：Compose 内置 mysql / redis（仅本地验收）

需要本机没有占用 3306/6379；在 `.env.example` 底部取消 bundled-infra 注释段（`@mysql:3306`、`REDIS_HOST=redis`）后执行：

```bash
docker compose --env-file .env.example --profile bundled-infra \
  -f docker-compose.yml -f docker-compose.bundled-infra.yml up --build -d
```

---

### 方式二：本地开发（推荐日常写代码）

适合：热更新调试；仅 MySQL / Redis 用 Docker。

**首次克隆 / 依赖变更后（初始化一次）：**

```bash
# 本地开发可新建 .env 覆盖 .env.example（gitignore，仅本机）；或改 .env.example 底部 bundled 段
docker compose --env-file .env.example --profile bundled-infra \
  -f docker-compose.yml -f docker-compose.bundled-infra.yml up -d mysql redis

npm install
npm run prisma:generate
npm run prisma:migrate:dev          # 交互式迁移；无新迁移时可跳过
```

本地 npm 开发时，可在 `shellder-agent/` 下新建 `.env`（指向 `localhost:3306`），会优先于 `.env.example` 加载。

**日常启动（开 3 个终端）：**

| 终端 | 命令 | 地址 |
|------|------|------|
| 1 | `npm run dev:server` | API http://localhost:3001 |
| 2 | `npm run dev:worker` | Worker http://localhost:3002 |
| 3 | `npm run dev:web` | 前台 http://localhost:3000（Vite dev，`/api` 代理至 3001） |

访问：http://localhost:3000/login → 登录占位进入 http://localhost:3000/

**仅停应用、保留数据：** 关掉三个终端即可；`docker compose stop mysql redis` 可停数据库。

---

## 服务端口

| 服务 | 端口 |
|------|------|
| shellder-web-console | http://localhost:3000 |
| shellder-agent-server | http://localhost:3001 |
| shellder-job-worker | http://localhost:3002 |
| MySQL | 3306 |
| Redis | 6379 |

## Prompt 防回归（21-C）

在 `shellder-agent-server` 目录执行（CI 未接入前建议提交前本地跑）：

```bash
cd shellder-agent-server && npm run check:prompt-constants
```

校验：禁止新增 `src/**/*.prompt.ts`（白名单仅 `connector/er-diagram.prompt.ts` 工具函数）、禁止 `export const *_SYSTEM_PROMPT`。规范见 [`project-analysis/implementation-constraints.md`](../project-analysis/implementation-constraints.md) §1D。

## 常见问题

### 前台 API 连不上 / 跨域

- 本地开发：`VITE_API_BASE_URL` 留空即可，Vite 将 `/api` 代理到 `VITE_API_PROXY_TARGET`（默认 `http://localhost:3001`）
- Docker 一键：`shellder-web-console` 由 nginx 同域反代 `/api`，无需单独配置

### `Can't reach database server at localhost:3306`（Docker 部署）

容器里的 **`localhost` 不是宿主机**。请编辑 **`.env.example`**（或目标机 `/data/shellder-agent/.env.example`），把 `DATABASE_URL` 改成 MySQL **真实 IP**：

```env
DATABASE_URL=mysql://iot5:密码@192.168.109.211:3306/agent_platform
REDIS_HOST=10.30.20.220
```

改完后重建容器。**若仍显示 localhost**，多半是宿主机上还有 `.env` 覆盖了 `.env.example`：

```bash
cd /data/shellder-agent
grep DATABASE_URL .env.example .env 2>/dev/null
mv .env .env.bak    # 必须移走旧 .env
docker compose up -d --force-recreate shellder-agent-server
docker exec shellder-agent-server printenv DATABASE_URL
```

### `Environment variable not found: DATABASE_URL`

- 确认 `shellder-agent/.env.example` 存在且含 `DATABASE_URL`
- `docker compose` 需加 `--env-file .env.example`，或直接使用 `bash scripts/deploy.sh`

### `docker: command not found`

需安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，或改用本机 MySQL 8 + Redis 并修改 `.env` 连接串。

### `Authentication failed` / `P1000`（用户 `agent` 密码不对）

说明 **MySQL 已能连上**，但 `.env` 里 `DATABASE_URL` 的账号密码与真实库不一致。

**若用 Docker Compose 起 MySQL：**

1. 确认 `DATABASE_URL` 与 `.env` 中 `MYSQL_USER` / `MYSQL_PASSWORD` 一致（默认 `agent` / `changeme_agent`）。
2. 若曾改过密码或反复 `up`，旧数据卷可能仍是旧密码 → 清空卷重建：
   ```bash
   docker compose down -v
   docker compose up -d mysql redis
   ```
3. 等约 30s 后：`npm run prisma:migrate:dev`

**若用本机 MySQL（Homebrew 等，占 3306）：**

在 MySQL 里创建与 `.env` 一致的库和用户，或把 `DATABASE_URL` 改成你已有的账号，例如：

```sql
CREATE DATABASE IF NOT EXISTS agent_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'agent'@'localhost' IDENTIFIED BY 'changeme_agent';
GRANT ALL PRIVILEGES ON agent_platform.* TO 'agent'@'localhost';
FLUSH PRIVILEGES;
```

**自检连接（任选）：**

```bash
mysql -h 127.0.0.1 -P 3306 -u agent -pchangeme_agent agent_platform -e "SELECT 1"
```

## Prisma 迁移

```bash
npm run prisma:migrate:dev   # 开发
npm run prisma:migrate       # 部署（migrate deploy）
```

## 文档

- 执行计划：[`project-analysis/agent-platform-执行计划/`](../project-analysis/agent-platform-执行计划/)
- 实施约束：[`project-analysis/implementation-constraints.md`](../project-analysis/implementation-constraints.md)
- 返工/验收提示：[`prompt/remediation/`](../prompt/remediation/)（与 monorepo 同级，自本目录相对路径 `../prompt/remediation/`）

## 阶段进度

> 对应 [`agent-platform-执行计划`](../project-analysis/agent-platform-执行计划/README.md) 序号 **01–19 + 11A**。  
> SQL 增量见 `project-sql/`：**11A** → `12-knowledge-base`；执行计划 **12–19** → `project-sql/13-*` … `20-*`。  
> 当前分支：**master**（最近提交含 01–19 代码与 Prisma 迁移补齐）。

- [x] **01** 工程脚手架与基础设施 — Monorepo / Docker Compose / Prisma 基线（`project-sql/01-bootstrap`）
- [x] **02** 租户管理 — `tenant` 表、`/api/v1/tenants`、页面 `/tenants`
- [x] **03** 用户与权限 — `user`/`role`/`user_role`/`user_tenant`、JWT + RBAC、`/api/v1/auth`·`/users`·`/roles`·`/permission-policies`、登录与用户/角色/权限页
- [x] **04** 审计模块与审计中心 — `tool_call_audit`/`user_action_audit`/`external_call_audit`、`@Audit` 采集、`/api/v1/audit`、页面 `/audit/*`
- [x] **05** 策略引擎与规则配置 — `rule`/`rule_hit`、`PolicyService.evaluate`、`/api/v1/rules`·`/rule-hits`、页面 `/rules`·`/rule-hits`
- [x] **06** 连接器管理 — `connector` 表、`connector_db_metadata`（06b）、`db_readonly` 库级 `SELECT 1` 连通性、结构抽取与 ER 图 API、页面 `/connectors`
- [x] **07** 工具注册与工具管理 — `tool` 表、`/api/v1/tools`、SQL 查询工具（只读 + 可选表/字段黑名单）、页面 `/tools`·`/tools/sql`
- [x] **08** 会话与消息核心 — `session`/`message` 表、`/api/v1/sessions`·`/messages`、页面 `/sessions`
- [x] **09** 任务中心与异步 Worker — `task`/`task_step`/`task_log`、`/api/v1/tasks`、BullMQ `shellder-job-worker`、页面 `/tasks/*`[^07]
- [x] **10** 能力路由 — `capability`/`routing_rule`、`/api/v1/capabilities`·`/routing-rules`·`/routing/test`、页面 `/routing/*`
- [x] **11** 技能书管理 — `skill`/`skill_trigger`/`skill_binding`/`skill_execution_log`、`/api/v1/skills`、页面 `/skills/*`
- [x] **11A** 知识库代理与知识库管理 — `knowledge_base` 租户绑定、`/api/v1/knowledge/*` 代理 wiki、`/api/v1/knowledge-bases`、页面 `/knowledge/*`（`project-sql/12-knowledge-base`）[^02][^08]
- [x] **12** Agent 运行时与流式响应 — `session`/`task` 枚举 `pending_confirm`、`/api/v1/sessions/:id/messages`·`/stream`·`/confirm`、SSE 事件（`project-sql/13-agent-runtime`）[^04]
- [x] **13** 四类业务能力 — qa/query/action/workflow Handler 编排；问答型 **wiki recall + 平台 LLM**；查询型 **ER 图 + NL2SQL + SqlToolService 执行**（`QueryModule` / `Nl2SqlService`，非 wiki 知识库）
- [x] **14** 审批中心 — `approval` 表、`/api/v1/approvals`、`ApprovalRuntimeService` 断点恢复、页面 `/approvals/*`（`project-sql/15-approval-center`）[^04]
- [x] **15** OpenAPI 对外接口与管理 — `openapi_app`/`openapi_call_log`、`/openapi/v1/*`·`/api/v1/openapi-apps`、页面 `/openapi/*`（`project-sql/16-openapi`）[^03]
- [x] **16** 会话管理与调试台 — 无新表、调试 API、页面 `/sessions/[id]`·`/sessions/messages`·`/sessions/debug`（`project-sql/17-session-debug-console`）
- [x] **17** 工作台 — 无新表、`GET /api/v1/dashboard/summary`、首页 `/`（`project-sql/18-workbench`）
- [x] **18** 系统设置 — `system_config`/`notification_template`、`/api/v1/system-settings`、页面 `/settings/*`（`project-sql/19-system-settings`）；**模型接入** `GET/PUT/POST /api/v1/settings/llm` + `/settings/llm`（平台 OpenAI 兼容 LLM，不代理 wiki settings/llm）
- [x] **19** 嵌入式 Copilot — `copilot_config` 表、`/api/v1/copilot/configs`·`/copilot/v1/*`、嵌入页 `/copilot`·`/copilot-admin/*`（`project-sql/20-embedded-copilot`）[^06]

**Prisma 迁移**：`shellder-agent-server/prisma/migrations/` 已覆盖 01–07 基线及 08–20 对应增量（含 `knowledge_pathy_binding`、`kb_layer_processing_job`）；空库 `npm run prisma:migrate` 验收见 [remediation/01](../prompt/remediation/01-补齐-prisma-migrations.md)。[^01]

### 返工脚注

| 标记 | 说明 | 文档 |
|------|------|------|
| [^01] | 08–20 迁移与 `project-sql` 对齐、空库 deploy 可复现 | [01-补齐-prisma-migrations.md](../prompt/remediation/01-补齐-prisma-migrations.md) |
| [^02] | wiki 代理方案、租户 wiki 前缀、废弃自建向量路径 | [02-知识库方向拍板与实现.md](../prompt/remediation/02-知识库方向拍板与实现.md) |
| [^03] | OpenAPI 发消息 / SSE 与 Agent Runtime 联调验收 | [03-openapi-对接-agent-runtime.md](../prompt/remediation/03-openapi-对接-agent-runtime.md) |
| [^04] | 会话确认 `/confirm`、审批后 Runtime 断点恢复 | [04-审批确认与-runtime-断点恢复.md](../prompt/remediation/04-审批确认与-runtime-断点恢复.md) |
| [^05] | Worker 驱动四类能力 / workflow 步骤真实执行 | [05-task-processor-接入四类能力.md](../prompt/remediation/05-task-processor-接入四类能力.md) |
| [^06] | Copilot 换票后会话 / 消息 / SSE / 确认全链路 | [06-copilot-后端与会话打通.md](../prompt/remediation/06-copilot-后端与会话打通.md) |
| [^07] | 异步通知、wiki 文档处理队列与系统设置模板 | [07-job-worker-通知与文档处理.md](../prompt/remediation/07-job-worker-通知与文档处理.md) |
| [^08] | 知识库 Web 子菜单（知识层 / 存储结构 / 媒体 / 问答测试）深化 | [08-知识库-web-菜单深化.md](../prompt/remediation/08-知识库-web-菜单深化.md) |

> ⚠️ 上表为 2026-05-29 进度审查项；`master` 已提交对应实现，**仍建议按 remediation 文档做联调与空库迁移验收**。  
> 执行计划文件名与 `project-sql` 编号不一致（11A vs `12-*`）见 [remediation/10](../prompt/remediation/10-执行计划文档编号统一.md)。

> 默认管理员：`admin / admin123`（首次启动自动创建，请尽快修改）。可用 `AUTH_BOOTSTRAP=false` 关闭自动创建，或用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 覆盖。
