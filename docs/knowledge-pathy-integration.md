# pathy-knowledge-server 集成说明

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PATHY_KNOWLEDGE_SERVER_BASE_URL` | `http://127.0.0.1:8765` | pathy 服务根 URL（无尾斜杠） |
| `PATHY_KNOWLEDGE_SERVER_TIMEOUT_MS` | `30000` | 代理 HTTP 超时（毫秒） |

配置位置：仓库根 `.env` / `.env.example`；Docker Compose 已注入 `shellder-agent-server`。

## 租户隔离

pathy 无内置多租户。平台在代理层注入 **wiki 子路径前缀**：

1. 读取租户 `active` 的 `knowledge_base.pathy_wiki_prefix`
2. 未配置则使用 `tenants/{tenantId}/`
3. 转发 layers 读写时拼接 `path` / `prefix`；`dialogue/recall` 合并 `wiki_prefix`

部署前请在 pathy `DATA_ROOT` 下创建对应目录（或通过运维为每租户独立 pathy 实例）。

## 本地联调步骤

1. 启动 pathy（示例）：
   ```bash
   # 在 pathy-knowledge-server 仓库
   uvicorn app.main:app --host 127.0.0.1 --port 8765
   ```
2. 确认健康检查：`curl http://127.0.0.1:8765/health`
3. 配置 shellder `.env`：`PATHY_KNOWLEDGE_SERVER_BASE_URL=http://127.0.0.1:8765`
4. 启动 `shellder-agent-server` 与 MySQL/Redis
5. 平台代理健康检查（需登录态与 `knowledge` 菜单权限）：
   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:3001/api/v1/knowledge/health"
   ```
6. 在 pathy `DATA_ROOT/wiki/` 下创建 `tenants/<tenantId>/` 并上传 `.md`，或通过管理后台代理上传：
   `POST /api/v1/knowledge/layers/raw/upload?tenantId=<id>`
7. 问答测试：
   ```bash
   curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     "http://localhost:3001/api/v1/knowledge/dialogue/recall-test?tenantId=<id>" \
     -d '{"query":"你的问题"}'
   ```

## 错误码（平台）

| code | HTTP | 含义 |
|------|------|------|
| `KNOWLEDGE_PROXY_UNAVAILABLE` | 503 | 未配置 Base URL、连接失败 |
| `KNOWLEDGE_PROXY_TIMEOUT` | 503 | 超时 |
| `KNOWLEDGE_PROXY_UPSTREAM` | 4xx/502 | pathy 返回错误或 5xx |
| `KNOWLEDGE_SELF_HOSTED_DEPRECATED` | 400 | 旧自建文档/分块 API 已废弃 |

## API 映射

平台前缀 `/api/v1/knowledge` → pathy `/api/v1`（详见 `project-analysis/API.md` 与 `KnowledgeProxyController`）。
