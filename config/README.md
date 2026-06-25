# 配置说明

| 文件 | 作用 |
|------|------|
| `application.yml.example` | 默认配置（提交到仓库） |
| `application-local.yml.example` | 本地 Profile 模板 |
| `application.yml` | 本地覆盖（gitignore，可选） |
| `application-local.yml` | `SHELLDER_PROFILE=local` 时加载（gitignore） |
| `.env.example` | 密钥与部署变量模板（提交） |
| `.env` | 本地密钥（gitignore） |

## 加载顺序

1. `.env`（若存在）
2. `application.yml.example`
3. `application.yml`（若存在）
4. `application-{profile}.yml`（若存在）

YAML 支持 `${ENV:default}` 占位，由环境变量解析。

## 代码读取

```typescript
import { applicationProperties, SystemConfigKey } from '@shellder/config';

const timeout = applicationProperties.get().app.basic.defaultTimeoutMs;
const key = SystemConfigKey.DEFAULT_TIMEOUT_MS;
```

## 本地开发

```bash
cp .env.example .env
cp application-local.yml.example application-local.yml
# .env 中设置 SHELLDER_PROFILE=local
```
