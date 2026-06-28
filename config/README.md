# 配置说明

| 文件 | 作用 |
|------|------|
| `.env.example` | 本地开发环境变量模板（提交） |
| `.env.dockeruse` | Docker / 部署环境变量（提交） |
| `application.yml.dockeruse` | Docker / 部署默认 YAML（提交） |
| `application-{profile}.yml.dockeruse` | Docker Profile 覆盖（提交，可选） |
| `.env` | 本地环境变量（gitignore，由 `.env.example` 复制） |
| `application.yml` | 本地 YAML 基础（gitignore，由 `application.yml.dockeruse` 复制） |
| `application-local.yml` | 本地可选覆盖（gitignore，有则合并，无则跳过） |

## 加载规则

**本地 npm 开发**（`npm run dev:*` 首次启动时自动复制模板，已存在则跳过）：

1. `config/.env` ← `config/.env.example`
2. `config/application.yml` ← `config/application.yml.dockeruse`
3. `config/application-local.yml`（**可选**：文件存在则 deepMerge，不存在则跳过）

也可手动执行 `bash scripts/setup-local-config.sh` 完成同样复制。本地连接串请在 `config/.env` 中按本机 MySQL/Redis 修改。

**Docker / 部署**（读取 `*.dockeruse`，容器内 `SHELLDER_CONFIG_SOURCE=docker`）：

1. `config/.env.dockeruse`（compose `env_file` 注入 + 运行时 dotenv）
2. `config/application.yml.dockeruse`
3. `config/application-{profile}.yml.dockeruse`（若存在）

YAML 支持 `${ENV:default}` 占位，由环境变量解析。

## 本地初始化

```bash
bash scripts/setup-local-config.sh
# 按需编辑 config/.env（默认与 bundled-infra 的 agent/changeme_agent 一致）
```

## 代码读取

```typescript
import { applicationProperties, SystemConfigKey } from '@shellder/config';

const timeout = applicationProperties.get().app.basic.defaultTimeoutMs;
const key = SystemConfigKey.DEFAULT_TIMEOUT_MS;
```
