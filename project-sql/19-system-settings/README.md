# 19-system-settings — 系统设置

> **执行序号**：18  
> **SQL 目录编号**：19  


## 本模块作用

平台级配置管理，涵盖三个子菜单：

1. **基础配置**：平台名称、Logo、默认超时、默认分页参数
2. **模型与响应配置**：流式响应开关、默认超时/重试参数、能力级响应模板
3. **通知配置**：消息通知接口（关联通知类连接器）、审批/任务完成/异常通知模板

## 依赖的前序模块

| 模块 | 依赖关系 |
|------|----------|
| 01-bootstrap | MySQL/Prisma 基线 |
| 06-connector-management | notification_template.connector_id 引用 connector 表 |
| 09-task-worker | job-worker 发送通知时读取模板 |

## 新增表

| 表名 | 说明 |
|------|------|
| `system_config` | 系统配置 KV 表（configKey 全局唯一） |
| `notification_template` | 通知模板（审批/任务完成/异常三类） |

## 执行顺序

```bash
mysql -u root -p agent_platform < schema.sql
mysql -u root -p agent_platform < seed.sql
```

`knowledge.wikiBaseUrl` / `knowledge.wikiTimeoutMs` 已写入 `seed.sql`。

## 注意事项

- `system_config.config_key` 为全局唯一，采用 `{group}.{key}` 命名规范
- `notification_template.connector_id` 为软关联（非外键约束），引用 connector 表中 type=notification 的记录
- Runtime 和 job-worker 读取配置时建议使用短 TTL Redis 缓存（如 30s），避免频繁查库
- 修改默认超时后新会话 Runtime 应立即生效（通过缓存失效或短 TTL 自然过期）
