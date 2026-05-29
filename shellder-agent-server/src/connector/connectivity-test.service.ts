import { Injectable, Logger } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { connect as netConnect } from 'net';
import { decryptSecret } from './connector-secret.util';
import {
  AuthType,
  ConnectivityResult,
  DbTarget,
} from './connector.types';

/**
 * 连通性测试（功能清单 §1.6 / 执行计划 §4.4）。
 *
 * - http / notification：对 target 发起真实 HTTP 请求（带认证头），校验连通性与认证有效性，
 *   返回状态码与响应耗时。
 * - db_readonly：对 host:port 做 TCP 可达性探测（查询型仅经只读 DB，不经 HTTP 查数，架构 §4.4）；
 *   深度的库认证有效性校验在 07-工具（SQL 查询工具）阶段结合驱动完成，此处做可达性 + 认证就绪校验。
 *
 * 所有外部调用由上层 ConnectorService 记入 04 external_call_audit。
 */
@Injectable()
export class ConnectivityTestService {
  private readonly logger = new Logger(ConnectivityTestService.name);

  async test(connector: Connector): Promise<ConnectivityResult> {
    const secret = decryptSecret((connector.config as { secretCipher?: string | null })?.secretCipher);
    const authType = (connector.authType as AuthType) ?? 'none';
    const timeoutMs = connector.timeoutMs ?? 5000;

    if (connector.type === 'db_readonly') {
      return this.testTcp(connector.target, timeoutMs, authType, secret);
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
      // < 400 视为连通且认证有效；401/403 视为认证无效；其余按 HTTP 语义提示
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
    const headers: Record<string, string> = { 'User-Agent': 'shellder-agent-connector-test' };
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
        // custom：secret 中以 header.* 约定的键直接作为请求头下发
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

  // ── 只读数据库（TCP 可达性） ────────────────────────────

  private testTcp(
    target: string,
    timeoutMs: number,
    authType: AuthType,
    secret: Record<string, unknown> | null,
  ): Promise<ConnectivityResult> {
    const parsed = this.parseDbTarget(target);
    if (!parsed) {
      return Promise.resolve({
        ok: false,
        latencyMs: 0,
        message: `目标格式无效（应为 host:port，当前：${target}）`,
      });
    }
    // 认证就绪校验：basic 认证需提供口令（具体校验留待 07-工具结合驱动）
    if (authType === 'basic' && (!secret || !secret.password)) {
      return Promise.resolve({
        ok: false,
        latencyMs: 0,
        message: '缺少数据库认证凭证（password）',
      });
    }

    const start = Date.now();
    return new Promise<ConnectivityResult>((resolve) => {
      let settled = false;
      const done = (result: ConnectivityResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      const socket = netConnect({ host: parsed.host, port: parsed.port });
      socket.setTimeout(timeoutMs);
      socket.once('connect', () =>
        done({
          ok: true,
          latencyMs: Date.now() - start,
          message: `TCP 可达（${parsed.host}:${parsed.port}）；库认证有效性将于工具注册阶段校验`,
        }),
      );
      socket.once('timeout', () =>
        done({
          ok: false,
          latencyMs: Date.now() - start,
          message: `连接超时（>${timeoutMs}ms）`,
        }),
      );
      socket.once('error', (err) =>
        done({
          ok: false,
          latencyMs: Date.now() - start,
          message: `连接失败：${err.message}`,
        }),
      );
    });
  }

  private parseDbTarget(target: string): DbTarget | null {
    // 支持 host:port 或 host:port/db；忽略可能的协议前缀
    const cleaned = target.replace(/^[a-z]+:\/\//i, '').split('/')[0];
    const idx = cleaned.lastIndexOf(':');
    if (idx <= 0) return null;
    const host = cleaned.slice(0, idx);
    const port = Number(cleaned.slice(idx + 1));
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
    return { host, port };
  }
}
