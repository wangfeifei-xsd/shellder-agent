# wiki 知识库服务集成说明

## 连接配置（MySQL）

wiki 服务地址**仅**保存在 MySQL `system_config` 表，由管理后台 **知识库管理 → wiki 知识库服务连接** 维护：

| config_key | 说明 |
|------------|------|
| `knowledge.wikiBaseUrl` | wiki 根 URL（无尾斜杠），如 `http://10.30.20.222:8765` |
| `knowledge.wikiTimeoutMs` | 代理 HTTP 超时（毫秒），默认 `30000` |

`shellder-agent-server` 与 `shellder-job-worker` 均从该表读取，**不再**使用环境变量 `PATHY_KNOWLEDGE_SERVER_*`（历史名，已废弃）。

**无需新建表**：复用 `system_config`。新装执行 `project-sql/19-system-settings/seed.sql` 已含默认行；已上线库可执行：

```bash
mysql -u root -p agent_platform < project-sql/19-system-settings/migrate-pathy-to-wiki-config.sql
mysql -u root -p agent_platform < project-sql/12-knowledge-base/migrate-pathy-wiki-prefix-column.sql
# 或仅补配置行：
mysql -u root -p agent_platform < project-sql/19-system-settings/seed-knowledge-wiki-config.sql
```

默认 `knowledge.wikiBaseUrl` 为空，部署后须在管理后台填写或 `UPDATE system_config` 写入实际地址。

## 租户隔离

wiki 服务无内置多租户。平台在代理层注入 **wiki 子路径前缀**：

1. 读取租户 `active` 的 `knowledge_base.wiki_prefix`
2. 未配置则使用 `tenants/{tenantId}/`
3. 转发 layers 读写时拼接 `path` / `prefix`；`dialogue/recall` 合并 `wiki_prefix`

部署前请在 wiki 服务 `DATA_ROOT` 下创建对应目录（或为每租户部署独立实例）。

## 本地联调步骤

1. 启动 wiki 知识库服务（示例）：
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8765
   ```
2. 确认健康检查：`curl http://127.0.0.1:8765/health`
3. 启动 `shellder-agent-server`、MySQL、Redis（及可选 `shellder-job-worker`）
4. 登录管理后台，在 **知识库管理** 保存 wiki 服务地址与超时
5. 平台代理健康检查（需登录态与 `knowledge` 菜单权限）：
   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:3001/api/v1/knowledge/health"
   ```
6. 在 wiki `DATA_ROOT/wiki/` 下创建 `tenants/<tenantId>/` 并上传 `.md`，或通过管理后台代理上传：
   `POST /api/v1/knowledge/layers/raw/upload?tenantId=<id>`

## 管理端「问答测试」

| 卡片 | 接口 | 说明 |
|------|------|------|
| 召回知识 | `POST /api/v1/knowledge/dialogue/recall` | 与 pathy-knowledge-web 一致，仅召回、不调用 LLM |
| 知识型问答测试 | `POST /api/v1/knowledge/dialogue/qa-preview` | wiki 召回 + 平台 LLM，与 Runtime 问答型能力一致 |

## 代理路由

平台前缀：`/api/v1/knowledge/*` → wiki 服务 `/api/v1/*`（需 `tenantId` 查询参数与租户权限）。

详见 `shellder-agent-server` 中 `KnowledgeProxyController` 与上游 `API.md`。
