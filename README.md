# shellder-agent

本目录为 **shellder-agent 可运行代码 Monorepo 根目录**（推 GitHub / 本地 `npm` / `docker compose` 均在此执行）。

Monorepo 包含 Web 管理后台（`shellder-web-console`）、主后端（`shellder-agent-server`）、异步 Worker（`shellder-job-worker`）。产品/架构文档见上级目录 [`project-analysis`](../project-analysis/)。

## 工程结构

| 目录 | 说明 |
|------|------|
| `shellder-web-console` | Next.js + Ant Design 管理后台 |
| `shellder-agent-server` | NestJS + Prisma 主 API |
| `shellder-job-worker` | NestJS + BullMQ 异步任务 |
| `project-sql/` | 按模块交付的 SQL 演进目录 |
| `monitoring/` | Prometheus / Loki 配置（可选 profile） |

## 前置要求

- Node.js ≥ 20
- npm 10+（随 Node 自带即可）
- Docker & Docker Compose（MySQL / Redis；方式一也可起三端应用）

> 以下命令均在 **`shellder-agent` 目录**执行（`cd shellder-agent`）。

---

## 本地启动流程

### 方式一：Docker 一键（三端 + MySQL + Redis）

适合：不想本地装 Node 依赖、快速验收环境。

```bash
cp .env.example .env          # 首次；按需改密码
docker compose up --build -d
```

验证：

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
open http://localhost:3000/login
```

停止：`docker compose down`

---

### 方式二：本地开发（推荐日常写代码）

适合：热更新调试；仅 MySQL / Redis 用 Docker。

**首次克隆 / 依赖变更后（初始化一次）：**

```bash
cp .env.example .env
docker compose up -d mysql redis    # 等 MySQL healthy（约 30s）

npm install
npm run prisma:generate
npm run prisma:migrate:dev          # 交互式迁移；无新迁移时可跳过
```

确认 **monorepo 根目录** 存在 `.env`（`cp .env.example .env`），且 `DATABASE_URL` 指向 `localhost:3306`。后端会自动向上查找该文件；若仍报 `DATABASE_URL not found`，请确认 `.env` 在 `shellder-agent/` 下而非上级目录。

**日常启动（开 3 个终端）：**

| 终端 | 命令 | 地址 |
|------|------|------|
| 1 | `npm run dev:server` | API http://localhost:3001 |
| 2 | `npm run dev:worker` | Worker http://localhost:3002 |
| 3 | `npm run dev:web` | 前台 http://localhost:3000 |

访问：http://localhost:3000/login → 登录占位进入 http://localhost:3000/

**仅停应用、保留数据：** 关掉三个终端即可；`docker compose stop mysql redis` 可停数据库。

---

### 方式三：可选监控栈

```bash
docker compose --profile monitoring up -d
# Prometheus :9090  Grafana :3003  Loki :3100
```

---

## 服务端口

| 服务 | 端口 |
|------|------|
| shellder-web-console | http://localhost:3000 |
| shellder-agent-server | http://localhost:3001 |
| shellder-job-worker | http://localhost:3002 |
| MySQL | 3306 |
| Redis | 6379 |

## 常见问题

### `Environment variable not found: DATABASE_URL`

- 在 `shellder-agent` 目录执行：`cp .env.example .env`
- 重新 `npm run dev:server`（已支持自动加载上级 `.env`）

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

- 执行计划：`project-analysis/agent-platform-执行计划/`
- 实施约束：`project-analysis/implementation-constraints.md`

## 阶段进度

- [x] **01** 工程脚手架与基础设施
- [x] **02** 租户管理（`tenant` 表、Tenant Management API `/api/v1/tenants`、管理后台 §1.11）
- [x] **03** 用户与权限（`user`/`role`/`user_role`/`user_tenant`、JWT 登录、RBAC、`/api/v1/auth`·`/users`·`/roles`·`/permission-policies`、管理后台 §1.10）
- [x] **04** 审计模块与审计中心（`tool_call_audit`/`user_action_audit`/`external_call_audit`、`@Audit` 采集、`/api/v1/audit`、管理后台 §1.9）
- [x] **05** 策略引擎与规则配置（`rule`/`rule_hit`、`PolicyService.evaluate`、`/api/v1/rules`·`/rule-hits`、管理后台 §1.7 规则部分）
- …

> 默认管理员：`admin / admin123`（首次启动自动创建，请尽快修改）。可用 `AUTH_BOOTSTRAP=false` 关闭自动创建，或用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 覆盖。
