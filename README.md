# Shellder Agent

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

> Shellder Agent 平台 Monorepo — 可运行的 Web 管理后台、主 API 与异步 Worker。

本仓库为 **shellder-agent 可运行代码根目录**（`npm` / `docker compose` 均在此执行）。产品与架构文档见 [project-analysis-v1-completed](project-analysis-v1-completed/README.md)（V1 已验收基线）；**实验中**仅技能书管理，其完整初始规格在内部 monorepo 的 `project-analysis/`（**未纳入本 GitHub 仓库**）。

## 目录

- [特性](#特性)
- [技术栈](#技术栈)
- [仓库结构](#仓库结构)
- [前置要求](#前置要求)
- [快速开始](#快速开始)
  - [Docker 部署（外置 MySQL / Redis）](#docker-部署外置-mysql--redis)
  - [本地开发（推荐）](#本地开发推荐)
- [服务与端口](#服务与端口)
- [常用命令](#常用命令)
- [数据库](#数据库)
- [开发规范](#开发规范)
- [二次开发指引](#二次开发指引)
- [常见问题](#常见问题)
- [相关文档](#相关文档)

## 特性

- **多租户 Agent 平台** — 租户、用户、RBAC、规则与 Policy、审批中心、审计
- **四类业务能力** — 问答 / 查询（NL2SQL）/ 操作型（含 http_query）/ 工作流，支持 SSE 流式响应
- **知识库代理** — 对接 wiki，租户级知识库管理
- **OpenAPI & Copilot** — 对外 API 与嵌入式对话组件
- **异步任务** — BullMQ Worker 驱动任务中心与后台作业

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vite · React 19 · React Router · Ant Design · Tailwind CSS |
| 后端 | NestJS · Prisma · JWT · BullMQ |
| 数据 | MySQL 8 · Redis |
| 部署 | Docker Compose · nginx（生产静态资源） |

## 仓库结构

```
├── shellder-web-console/           # Web 管理后台（CSR SPA）
├── shellder-agent-server/          # 主 API（REST + SSE）
├── shellder-job-worker/            # 异步 Worker（BullMQ）
├── project-analysis-v1-completed/  # V1 已验收方案文档（二次开发入口）
├── project-sql/                    # 按模块交付的 SQL 演进
├── docker-compose.yml
├── .env.example
└── scripts/deploy.sh
```

| 目录 | 说明 |
|------|------|
| `shellder-web-console` | Vite + React Router + Ant Design 管理后台 |
| `shellder-agent-server` | NestJS + Prisma 主 API |
| `shellder-job-worker` | NestJS + BullMQ 异步任务 |
| `project-analysis-v1-completed/` | V1 已验收方案与模块说明（本仓库内可跳转） |
| `project-sql/` | 按模块交付的 SQL 演进目录 |

## 前置要求

- **Node.js** ≥ 20
- **npm** 10+（随 Node 自带即可）
- **Docker & Docker Compose**（MySQL / Redis；Docker 方式也可直接起三端应用）

> 以下命令均在 **本仓库根目录**执行（克隆后 `cd shellder-agent` 即为此目录）。

## 快速开始

### Docker 部署（外置 MySQL / Redis）

**默认行为**：`docker compose up` 只启动三个应用容器，**不会**创建 mysql/redis。连接地址来自 **`.env.example`**（Jenkins scp 会一并下发）。

Docker 部署**只启动应用容器**，不执行任何 SQL。库表与种子数据由运维自行维护，见 [`project-sql/README.md`](project-sql/README.md)。

```bash
# 按需编辑 .env.example 中的 DATABASE_URL、REDIS_HOST 等
docker compose --env-file .env.example up --build -d

# 或使用部署脚本（Jenkins）
bash scripts/deploy.sh
```

验证：

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
open http://localhost:3000/login
```

停止：`docker compose down`

<details>
<summary><strong>Jenkins 远程部署</strong></summary>

```bash
scp -r ./ 10.30.20.222:/data/shellder-agent
ssh 10.30.20.222 'cd /data/shellder-agent && bash scripts/deploy.sh'
```

</details>

<details>
<summary><strong>可选：Compose 内置 mysql / redis（仅本地验收）</strong></summary>

需要本机没有占用 3306/6379；在 `.env.example` 底部取消 bundled-infra 注释段（`@mysql:3306`、`REDIS_HOST=redis`）后执行：

```bash
docker compose --env-file .env.example --profile bundled-infra \
  -f docker-compose.yml -f docker-compose.bundled-infra.yml up --build -d
```

</details>

### 本地开发（推荐）

适合热更新调试；仅 MySQL / Redis 用 Docker。

**首次克隆 / 依赖变更后（初始化一次）：**

```bash
# 本地开发可新建 .env 覆盖 .env.example（gitignore，仅本机）；或改 .env.example 底部 bundled 段
docker compose --env-file .env.example --profile bundled-infra \
  -f docker-compose.yml -f docker-compose.bundled-infra.yml up -d mysql redis

npm install
npm run prisma:generate

# 首次建库：手动执行 project-sql/00-all-schema.sql、00-all-seed.sql
```

本地 npm 开发时，可在 `shellder-agent/` 下新建 `.env`（指向 `localhost:3306`），会优先于 `.env.example` 加载。

**日常启动（开 3 个终端）：**

| 终端 | 命令 | 地址 |
|:----:|------|------|
| 1 | `npm run dev:server` | API http://localhost:3001 |
| 2 | `npm run dev:worker` | Worker http://localhost:3002 |
| 3 | `npm run dev:web` | 前台 http://localhost:3000 |

访问 http://localhost:3000/login → 登录后进入 http://localhost:3000/

> Vite dev 将 `/api` 代理至 `3001`，`VITE_API_BASE_URL` 留空即可。

**仅停应用、保留数据：** 关掉三个终端即可；`docker compose stop mysql redis` 可停数据库。

## 服务与端口

| 服务 | 地址 |
|------|------|
| shellder-web-console | http://localhost:3000 |
| shellder-agent-server | http://localhost:3001 |
| shellder-job-worker | http://localhost:3002 |
| MySQL | `localhost:3306` |
| Redis | `localhost:6379` |

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev:web` | 启动管理后台（Vite） |
| `npm run dev:server` | 启动主 API（watch 模式） |
| `npm run dev:worker` | 启动异步 Worker |
| `npm run build` | 构建全部 workspace（推荐提交前执行） |
| `npm run prisma:generate` | 生成 Prisma Client |

## 数据库

结构 + 种子以 `project-sql/00-all-schema.sql`、`00-all-seed.sql` 为准，**新库**发版前由运维自行执行。

**已有库升级**：勿重跑全量 DDL，按 [`project-sql/README.md`](project-sql/README.md) 执行增量目录（如 `22-tool-http-query`、`23-routing-llm-classify`）。

本地开发 `npm run prisma:generate` 仅用于生成 ORM 客户端（不连库、不跑迁移）；表结构以 `project-sql/` 为准，Prisma 无 migrate 流程。

## 开发规范

### Prompt 管理（21-C）

改 Prompt 相关代码前必读 [06-实施约束-已落地 §4 Prompt 管理](project-analysis-v1-completed/06-实施约束-已落地.md#4-prompt-管理1d)。硬约束摘要：

- Prompt 正文以 `prompt_template` / `prompt_version` 为唯一来源（SSOT），禁止在业务代码硬编码 System Prompt
- 禁止新增 `src/**/*.prompt.ts`（白名单仅 `connector/er-diagram.prompt.ts`）
- 禁止 `export const *_SYSTEM_PROMPT`

> `npm run check:prompt-constants` 自动检查脚本尚未接入；提交前请对照上文约束人工自检。

### 默认管理员

首次启动自动创建 **`admin` / `admin123`**，请尽快修改。

- 关闭自动创建：`AUTH_BOOTSTRAP=false`
- 自定义账号：`ADMIN_USERNAME` / `ADMIN_PASSWORD`

## 二次开发指引

[`project-analysis-v1-completed/`](project-analysis-v1-completed/) 是以 **已验收功能** 为基线的方案文档，供人类开发者或各类 AI Agent 在改造、扩展本平台时快速理解现状，避免误读未验收模块或偏离已落地约束。

**入口**：[`project-analysis-v1-completed/README.md`](project-analysis-v1-completed/README.md)

### 文档地图

| 文档 | 何时阅读 |
|------|----------|
| [01-范围与边界](project-analysis-v1-completed/01-范围与边界.md) | 确认 V1 已完成 / 实验中 / 与初始方案差异 |
| [02-架构设计-V1已完成](project-analysis-v1-completed/02-架构设计-V1已完成.md) | 理解模块依赖与运行时链路 |
| [03-功能清单-V1已完成](project-analysis-v1-completed/03-功能清单-V1已完成.md) | 查已验收菜单与能力清单 |
| [04-代码导航](project-analysis-v1-completed/04-代码导航.md) | 定位前后端目录、路由、Controller、API 前缀 |
| [05-数据模型](project-analysis-v1-completed/05-数据模型.md) | 查 Prisma 表与模块关联 |
| [06-实施约束-已落地](project-analysis-v1-completed/06-实施约束-已落地.md) | 改代码前必读硬约束（Prompt、LLM、租户等） |
| [modules/](project-analysis-v1-completed/modules/) | 按管理后台菜单拆分的模块说明 |
| [capabilities/](project-analysis-v1-completed/capabilities/) | 问答型 / 查询型等业务能力说明 |

### 按任务选文档

| 改造目标 | 建议阅读顺序 |
|----------|--------------|
| 某个管理后台菜单或页面 | `modules/xx-*.md` → [04-代码导航](project-analysis-v1-completed/04-代码导航.md) → 对应 `src/pages/console/` 与 NestJS 模块 |
| 问答 / 问数等业务能力 | [capabilities/](project-analysis-v1-completed/capabilities/) + [modules/02-知识库](project-analysis-v1-completed/modules/02-知识库.md) 或 [modules/03-查询型配置](project-analysis-v1-completed/modules/03-查询型配置.md) |
| Copilot / OpenAPI 接入 | [modules/07-嵌入式Copilot](project-analysis-v1-completed/modules/07-嵌入式Copilot.md)、[modules/08-OpenAPI管理](project-analysis-v1-completed/modules/08-OpenAPI管理.md) |
| 规则 / 审批 / 任务中心 | [modules/16-规则与Policy](project-analysis-v1-completed/modules/16-规则与Policy.md)、[modules/17-审批中心](project-analysis-v1-completed/modules/17-审批中心.md)、[modules/18-任务中心](project-analysis-v1-completed/modules/18-任务中心.md) |
| 能力路由 / http_query 工具 | [modules/13-能力路由](project-analysis-v1-completed/modules/13-能力路由.md)、[modules/12-工具管理](project-analysis-v1-completed/modules/12-工具管理.md) |
| 数据表或 ORM 变更 | [05-数据模型](project-analysis-v1-completed/05-数据模型.md) → `project-sql/` 递增 SQL → `npm run prisma:generate` |
| 实验中菜单（仅技能书） | 侧栏标注「（实验中）」的**技能书管理**不在 V1 验收基线内；边界见 [01-范围与边界 §2](project-analysis-v1-completed/01-范围与边界.md#2-v1-未完成--实验中范围)。完整初始规格在内部 monorepo `project-analysis/`（未纳入本仓库） |

### 给 AI Agent 的使用建议

将以下文件作为上下文一并提供给 Agent，可显著降低「改错模块 / 违反约束」的概率：

1. **任务相关**：目标模块的 `modules/*.md` 或 `capabilities/*.md`
2. **定位代码**：[04-代码导航](project-analysis-v1-completed/04-代码导航.md)
3. **硬约束**：[06-实施约束-已落地](project-analysis-v1-completed/06-实施约束-已落地.md) + 上文 [Prompt 管理](#prompt-管理21-c)

**原则**：以 **当前代码与 `project-analysis-v1-completed` 文档** 为准；各模块文末「对照初始方案」仅作差异参考，勿以其覆盖现网实现。

### V1 边界速记

- **已完成**：侧栏**未**标注「（实验中）」的菜单及其关联能力（见 [已完成菜单一览](project-analysis-v1-completed/README.md#已完成菜单一览)）。含规则、审批中心、任务中心、能力路由、工具管理（http_query）、审计中心等（2026-06 起已产品化）。
- **实验中**：仅 **技能书管理**（侧栏标注「（实验中）」）；后端 `skill/` 模块存在，管理 UI 未纳入 V1 验收。
- **四类业务能力**：问答 / 查询 / 操作型（含 http_query）/ 流程型均已通过会话调试、Copilot、OpenAPI、**能力演示**等正式入口验证；流程型任务写入任务中心 UI。

## 常见问题

<details>
<summary><strong>前台 API 连不上 / 跨域</strong></summary>

- **本地开发**：`VITE_API_BASE_URL` 留空，Vite 将 `/api` 代理到 `VITE_API_PROXY_TARGET`（默认 `http://localhost:3001`）
- **Docker 一键**：`shellder-web-console` 由 nginx 同域反代 `/api`，无需单独配置

</details>

<details>
<summary><strong>Can't reach database server at localhost:3306（Docker 部署）</strong></summary>

容器里的 **`localhost` 不是宿主机**。请编辑 **`.env.example`**，把 `DATABASE_URL` 改成 MySQL **真实 IP**：

```env
DATABASE_URL=mysql://iot5:密码@192.168.109.211:3306/agent_platform
REDIS_HOST=10.30.20.220
```

改完后重建容器。若仍显示 localhost，多半是宿主机 `.env` 覆盖了 `.env.example`：

```bash
cd /data/shellder-agent
grep DATABASE_URL .env.example .env 2>/dev/null
mv .env .env.bak
docker compose up -d --force-recreate shellder-agent-server
docker exec shellder-agent-server printenv DATABASE_URL
```

</details>

<details>
<summary><strong>Environment variable not found: DATABASE_URL</strong></summary>

- 确认 `shellder-agent/.env.example` 存在且含 `DATABASE_URL`
- `docker compose` 需加 `--env-file .env.example`，或直接使用 `bash scripts/deploy.sh`

</details>

<details>
<summary><strong>docker: command not found</strong></summary>

需安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，或改用本机 MySQL 8 + Redis 并修改 `.env` 连接串。

</details>

<details>
<summary><strong>Authentication failed / P1000（用户 agent 密码不对）</strong></summary>

说明 **MySQL 已能连上**，但 `.env` 里 `DATABASE_URL` 的账号密码与真实库不一致。

**若用 Docker Compose 起 MySQL：**

1. 确认 `DATABASE_URL` 与 `.env` 中 `MYSQL_USER` / `MYSQL_PASSWORD` 一致（默认 `agent` / `changeme_agent`）
2. 若曾改过密码或反复 `up`，旧数据卷可能仍是旧密码 → 清空卷重建：
   ```bash
   docker compose down -v
   docker compose up -d mysql redis
   ```
3. 等约 30s 后手动执行 `project-sql/00-all-schema.sql`、`00-all-seed.sql`

**若用本机 MySQL（Homebrew 等，占 3306）：**

```sql
CREATE DATABASE IF NOT EXISTS agent_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'agent'@'localhost' IDENTIFIED BY 'changeme_agent';
GRANT ALL PRIVILEGES ON agent_platform.* TO 'agent'@'localhost';
FLUSH PRIVILEGES;
```

**自检连接：**

```bash
mysql -h 127.0.0.1 -P 3306 -u agent -pchangeme_agent agent_platform -e "SELECT 1"
```

</details>

<details>
<summary><strong>Docker 故障排查</strong></summary>

```bash
docker logs --tail 200 shellder-agent-server
curl http://localhost:3001/health/live
curl http://localhost:3001/health
```

</details>

## 相关文档

| 文档 | 路径 |
|------|------|
| V1 已完成方案（二次开发） | [`project-analysis-v1-completed/README.md`](project-analysis-v1-completed/README.md) |
| 代码导航 | [`project-analysis-v1-completed/04-代码导航.md`](project-analysis-v1-completed/04-代码导航.md) |
| 实施约束（已落地） | [`project-analysis-v1-completed/06-实施约束-已落地.md`](project-analysis-v1-completed/06-实施约束-已落地.md) |
| SQL 演进 | [`project-sql/README.md`](project-sql/README.md) |
| 实验中模块边界（技能书） | [01-范围与边界 §2](project-analysis-v1-completed/01-范围与边界.md#2-v1-未完成--实验中范围) |
| 初始方案全文（仅内部 monorepo） | `project-analysis/`（与 `22.agent-analysis` 工作区同级，未推送到本仓库） |