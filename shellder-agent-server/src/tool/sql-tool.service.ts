import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { createConnection } from 'mysql2/promise';
import { resolveDbConnectionParams } from '../connector/db-connection.util';
import { LegacySqlToolConfig, SqlToolConfig, DEFAULT_SQL_CONFIG } from './tool.types';

/** SQL 工具执行结果（应用层） */
export interface SqlExecResult {
  ok: boolean;
  /** 实际执行的（参数绑定前的）SQL */
  executedSql: string;
  /** 命名参数解析出的有序取值 */
  boundValues: unknown[];
  rowCount: number;
  rows: Record<string, unknown>[];
  durationMs: number;
  message: string;
}

/** 只读 SQL 之外的禁用关键字（作为独立词出现即拒绝） */
const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'truncate',
  'replace',
  'grant',
  'revoke',
  'merge',
  'call',
  'lock',
  'unlock',
  'rename',
  'into',
  'set',
  'use',
  'load',
  'handler',
];

/**
 * SQL 查询工具执行（执行计划 §4.5 / 验收标准 3）。
 *
 * 仅用于 query 型 Tool + db_readonly 连接器（查询型仅经只读 DB，不经 HTTP 查数，架构 §4.4）。
 * 安全约束（执行前 / 执行中逐层拦截）：
 * 1. 只读校验：仅允许 SELECT / WITH...SELECT 单条语句；命中写 / DDL 关键字一律拒绝。
 * 2. 表黑名单：SQL 引用的表不得命中 config.sql.tableBlacklist（未配置则不限制表）。
 * 3. 最大返回行数：以子查询包裹 + LIMIT(maxRows+1) 执行；超出 maxRows 拒绝（验收标准 3）。
 * 4. 最大执行时长：mysql2 query timeout = maxExecutionMs；超时拒绝（验收标准 3）。
 * 命名参数（:name）经 mysql2 占位符绑定，避免拼接注入。
 */
@Injectable()
export class SqlToolService {
  private readonly logger = new Logger(SqlToolService.name);

  /** 静态校验：只读 + 单语句 + 表黑名单（不连接数据库；供保存 / 执行前拦截）。 */
  assertReadonlySql(sql: string, sqlConfig: SqlToolConfig): void {
    const cleaned = this.stripComments(sql).trim().replace(/;+\s*$/, '');
    if (!cleaned) {
      throw new BadRequestException({ code: 'SQL_EMPTY', message: 'SQL 不能为空' });
    }
    if (cleaned.includes(';')) {
      throw new BadRequestException({
        code: 'SQL_MULTI_STATEMENT',
        message: '仅允许单条 SQL 语句',
      });
    }
    const lower = cleaned.toLowerCase();
    if (!/^\s*(select|with)\b/.test(lower)) {
      throw new BadRequestException({
        code: 'SQL_NOT_READONLY',
        message: '仅允许只读查询（SELECT / WITH）',
      });
    }
    for (const kw of FORBIDDEN_KEYWORDS) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) {
        throw new BadRequestException({
          code: 'SQL_FORBIDDEN_KEYWORD',
          message: `SQL 含禁用关键字：${kw}（仅允许只读查询）`,
        });
      }
    }
    const referenced = this.extractTables(lower);
    this.assertTableAccess(referenced, sqlConfig);
  }

  /** @deprecated 使用 assertReadonlySql */
  assertReadonlyAndWhitelisted(sql: string, sqlConfig: SqlToolConfig): void {
    this.assertReadonlySql(sql, sqlConfig);
  }

  /** 提取 SQL 中 FROM/JOIN 引用的物理表名（供数据范围过滤等） */
  extractReferencedTables(sql: string): string[] {
    const lower = this.stripComments(sql).trim().toLowerCase();
    return this.extractTables(lower);
  }

  private assertTableAccess(referenced: string[], sqlConfig: SqlToolConfig): void {
    const legacy = sqlConfig as LegacySqlToolConfig;
    const blacklist = (sqlConfig.tableBlacklist ?? []).map((t) => t.toLowerCase());
    if (blacklist.length > 0) {
      const blocked = referenced.filter((t) => blacklist.includes(t));
      if (blocked.length > 0) {
        throw new BadRequestException({
          code: 'SQL_TABLE_BLACKLISTED',
          message: `引用了黑名单中的表：${blocked.join(', ')}`,
        });
      }
      return;
    }
    // 历史数据：仍配置了表白名单时沿用白名单语义，直至重新保存为黑名单配置
    const legacyWhitelist = (legacy.tableWhitelist ?? []).map((t) => t.toLowerCase());
    if (legacyWhitelist.length === 0) return;
    const illegal = referenced.filter((t) => !legacyWhitelist.includes(t));
    if (illegal.length > 0) {
      throw new BadRequestException({
        code: 'SQL_TABLE_NOT_ALLOWED',
        message: `引用了白名单外的表：${illegal.join(', ')}`,
      });
    }
  }

  /**
   * 执行 SQL（已通过静态校验后）。连接 db_readonly 连接器，应用行数 / 时长上限。
   */
  async execute(
    connector: Connector,
    rawSql: string,
    params: Record<string, unknown>,
    sqlConfig: SqlToolConfig,
  ): Promise<SqlExecResult> {
    this.assertReadonlySql(rawSql, sqlConfig);

    const maxRows = sqlConfig.maxRows > 0 ? sqlConfig.maxRows : DEFAULT_SQL_CONFIG.maxRows;
    const maxExecutionMs =
      sqlConfig.maxExecutionMs > 0 ? sqlConfig.maxExecutionMs : DEFAULT_SQL_CONFIG.maxExecutionMs;

    const { sql: boundSql, values } = this.bindNamedParams(
      this.stripComments(rawSql).trim().replace(/;+\s*$/, ''),
      params,
    );
    // 子查询包裹 + LIMIT(maxRows+1)：超出即判定超行数（验收标准 3）
    const wrapped = `SELECT * FROM (${boundSql}) AS __shellder_sub LIMIT ${maxRows + 1}`;

    const dbParams = resolveDbConnectionParams(connector);

    const start = Date.now();
    let conn: Awaited<ReturnType<typeof createConnection>> | undefined;
    try {
      conn = await createConnection({
        host: dbParams.host,
        port: dbParams.port,
        user: dbParams.user,
        password: dbParams.password,
        database: dbParams.database,
        connectTimeout: dbParams.connectTimeoutMs,
        multipleStatements: false,
      });

      const [rows] = await conn.query({
        sql: wrapped,
        values,
        timeout: maxExecutionMs,
      });
      const durationMs = Date.now() - start;
      const result = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];

      if (result.length > maxRows) {
        throw new BadRequestException({
          code: 'SQL_ROW_LIMIT_EXCEEDED',
          message: `结果超过最大返回行数（> ${maxRows}）`,
        });
      }

      return {
        ok: true,
        executedSql: boundSql,
        boundValues: values,
        rowCount: result.length,
        rows: result,
        durationMs,
        message: `查询成功，返回 ${result.length} 行`,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const durationMs = Date.now() - start;
      const message = this.normalizeDbError(err, maxExecutionMs);
      this.logger.warn(`SQL 工具执行失败：${message}`);
      throw new BadRequestException({ code: 'SQL_EXEC_FAILED', message });
    } finally {
      if (conn) await conn.end().catch(() => undefined);
    }
  }

  // ── 内部辅助 ────────────────────────────────────────────

  /** 将 :name 命名参数替换为 ? 占位符，并按出现顺序生成取值数组。 */
  private bindNamedParams(
    sql: string,
    params: Record<string, unknown>,
  ): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    const replaced = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name: string) => {
      if (!(name in params)) {
        throw new BadRequestException({
          code: 'SQL_PARAM_MISSING',
          message: `缺少命名参数：:${name}`,
        });
      }
      values.push(params[name]);
      return '?';
    });
    return { sql: replaced, values };
  }

  private stripComments(sql: string): string {
    return sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')
      .replace(/#[^\n]*/g, ' ');
  }

  /** 粗粒度提取 FROM / JOIN 后的表名（去除 schema 前缀与反引号）。 */
  private extractTables(lowerSql: string): string[] {
    const tables = new Set<string>();
    const re = /\b(?:from|join)\s+([`"\w.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lowerSql)) !== null) {
      let name = m[1].replace(/[`"]/g, '');
      const dot = name.lastIndexOf('.');
      if (dot >= 0) name = name.slice(dot + 1);
      if (name) tables.add(name);
    }
    return [...tables];
  }

  private normalizeDbError(err: unknown, maxExecutionMs: number): string {
    const e = err as { code?: string; message?: string };
    if (e?.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || /timeout/i.test(e?.message ?? '')) {
      return `执行超时（> ${maxExecutionMs}ms）`;
    }
    return e?.message ?? String(err);
  }

}
