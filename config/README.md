# 配置说明

| 文件 | 作用 |
|------|------|
| `.env.dockeruse` | Docker / 部署环境变量（提交） |
| `application.yml.dockeruse` | Docker / 部署默认 YAML（提交） |
| `application-{profile}.yml.dockeruse` | Docker Profile 覆盖（提交，可选） |
| `.env` | 本地密钥（gitignore） |
| `application.yml` | 本地 YAML 基础（gitignore） |
| `application-{profile}.yml` | 本地 Profile 覆盖（gitignore） |

## 加载规则

**本地 npm 开发**（读取 gitignore 文件）：

1. `config/.env`
2. `config/application.yml`
3. `config/application-{profile}.yml`（`SHELLDER_PROFILE` 非 default 时）

**Docker / 部署**（读取 `*.dockeruse`，容器内 `SHELLDER_CONFIG_SOURCE=docker`）：

1. `config/.env.dockeruse`（compose `env_file` 注入 + 运行时 dotenv）
2. `config/application.yml.dockeruse`
3. `config/application-{profile}.yml.dockeruse`（若存在）

YAML 支持 `${ENV:default}` 占位，由环境变量解析。

## 本地初始化

```bash
bash scripts/setup-local-config.sh
```

## 代码读取

```typescript
import { applicationProperties, SystemConfigKey } from '@shellder/config';

const timeout = applicationProperties.get().app.basic.defaultTimeoutMs;
const key = SystemConfigKey.DEFAULT_TIMEOUT_MS;
```
