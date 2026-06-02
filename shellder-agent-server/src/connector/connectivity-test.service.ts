import { Injectable, Logger } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { decryptSecret } from './connector-secret.util';
import {
  AuthType,
  ConnectivityResult,
} from './connector.types';
import {
  openDbConnection,
  parseDbTarget,
  readConnectorConfig,
  requireDatabase,
} from './db-connection.util';

/**
 * 连通性测试（功能清单 §1.6 / 执行计划 §4.4）。
 *
 * - http / notification：对 target 发起真实 HTTP 请求（带认证头），校验连通性与认证有效性。
 * - db_readonly：使用 mysql2 执行 SELECT 1，校验库级认证与 database 可访问（查询型 §2.3）。
 */
@Injectable()
export class ConnectivityTestService {
  private readonly logger = new Logger(ConnectivityTestService.name);

  async test(connector: Connector): Promise<ConnectivityResult> {
    const secret = decryptSecret(
      readConnectorConfig(connector).secretCipher,
    );
    const authType = (connector.authType as AuthType) ?? 'none';
    const timeoutMs = connector.timeoutMs ?? 5000;

    if (connector.type === 'db_readonly') {
      return this.testDbReadonly(connector, timeoutMs, authType, secret);
    }
    return this.testHttp(connector.target, timeoutMs, authType, secret);
  }

  // ── HTTP / 通知接口 ─────────────────────────────────────

  private async testHttp(
    target: string,
    timeoutMs: number,
    authType: AuthType,
    secret: Record<string, unknown> | null,
  ): Promise<ConnectivityResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = this.buildAuthHeaders(authType, secret);
      const res = await fetch(target, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'manual',
      });
      const latencyMs = Date.now() - start;
      const ok = res.status < 400;
      const authInvalid = res.status === 401 || res.status === 403;
      const message = ok
        ? `连通正常（HTTP ${res.status}）`
        : authInvalid
          ? `认证失败（HTTP ${res.status}）`
          : `目标返回 HTTP ${res.status}`;
      return { ok, latencyMs, statusCode: res.status, message };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const aborted = err instanceof Error && err.name === 'AbortError';
      const message = aborted
        ? `请求超时（>${timeoutMs}ms）`
        : `连接失败：${err instanceof Error ? err.message : String(err)}`;
      return { ok: false, latencyMs, message };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildAuthHeaders(
    authType: AuthType,
    secret: Record<string, unknown> | null,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'shellder-agent-connector-test',
    };
    if (!secret) return headers;
    switch (authType) {
      case 'basic': {
        const username = String(secret.username ?? '');
        const password = String(secret.password ?? '');
        headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
        break;
      }
      case 'bearer':
        if (secret.token) headers.Authorization = `Bearer ${String(secret.token)}`;
        break;
      case 'api_key': {
        const headerName = String(secret.headerName ?? 'X-API-Key');
        if (secret.apiKey) headers[headerName] = String(secret.apiKey);
        break;
      }
      case 'custom':
        for (const [key, value] of Object.entries(secret)) {
          if (key.startsWith('header.')) headers[key.slice('header.'.length)] = String(value);
        }
        break;
      case 'none':
      default:
        break;
    }
    return headers;
  }

  // ── 只读数据库（SELECT 1） ───────────────────────────────

  private async testDbReadonly(
    connector: Connector,
    timeoutMs: number,
    authType: AuthType,
    secret: Record<string, unknown> | null,
  ): Promise<ConnectivityResult> {
    const start = Date.now();
    try {
      parseDbTarget(connector.target);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `目标格式无效（应为 host:port，当前：${connector.target}）`;
      return { ok: false, latencyMs: 0, message };
    }

    if (authType !== 'basic') {
      return {
        ok: false,
        latencyMs: 0,
        message: '只读数据库连接器须使用 Basic 认证并配置用户名与口令',
      };
    }

    const config = readConnectorConfig(connector);
    let database: string;
    try {
      database = requireDatabase(config.properties);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '缺少逻辑库名 properties.database';
      return { ok: false, latencyMs: 0, message };
    }

    if (authType === 'basic' && (!secret || !secret.password)) {
      return {
        ok: false,
        latencyMs: 0,
        message: '缺少数据库认证凭证（password）',
      };
    }

    const { host, port } = parseDbTarget(connector.target);
    const user =
      typeof secret?.username === 'string'
        ? secret.username
        : typeof config.properties.username === 'string'
          ? config.properties.username
          : undefined;
    const password =
      typeof secret?.password === 'string' ? secret.password : undefined;

    let conn: Awaited<ReturnType<typeof openDbConnection>> | undefined;
    try {
      conn = await openDbConnection({
        host,
        port,
        database,
        user,
        password,
        connectTimeoutMs: timeoutMs,
      });
      await conn.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        latencyMs,
        message: `库连接成功（${host}:${port}/${database}）`,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        latencyMs,
        message: this.normalizeDbTestError(err, timeoutMs),
      };
    } finally {
      if (conn) await conn.end().catch(() => undefined);
    }
  }

  private normalizeDbTestError(err: unknown, timeoutMs: number): string {
    const e = err as { code?: string; errno?: number; message?: string };
    if (e?.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || /timeout/i.test(e?.message ?? '')) {
      return `连接超时（>${timeoutMs}ms）`;
    }
    if (e?.code === 'ER_ACCESS_DENIED_ERROR' || e?.errno === 1045) {
      return '认证失败：用户名或口令错误';
    }
    if (e?.code === 'ER_BAD_DB_ERROR' || e?.errno === 1049) {
      return '库不存在或当前账号无权访问该库';
    }
    if (e?.code === 'ECONNREFUSED') {
      return '无法连接数据库主机（连接被拒绝）';
    }
    return `连接失败：${e?.message ?? String(err)}`;
  }
}
