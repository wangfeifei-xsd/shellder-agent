import { Injectable } from '@nestjs/common';
import { AuditStatus, Connector, Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/jwt.types';
import { PolicyService } from '../policy/policy.service';
import { PolicyDecision } from '../policy/policy.types';
import { decryptSecret } from '../connector/connector-secret.util';
import { Nl2SqlService } from '../query/nl2sql.service';
import { QueryResultService } from '../query/query-result.service';
import { SqlToolService } from './sql-tool.service';
import { Nl2SqlPreviewDto } from './dto/nl2sql-preview.dto';
import { TestSqlDto, TestToolDto } from './dto/test-tool.dto';
import { ToolService } from './tool.service';
import { validateAgainstSchema, SchemaValidationResult } from './schema-validator.util';
import {
  HttpToolConfig,
  SqlToolConfig,
  TOOL_TYPE_CAPABILITY,
} from './tool.types';

/** 调用测试响应（执行计划 §4.4：原始请求/响应、转换结果、schema 校验结果、Policy 决策） */
export interface ToolTestResult {
  /** Policy 决策（架构 §4.2） */
  policy: PolicyDecision;
  /** 入参 schema 校验结果 */
  inputValidation: SchemaValidationResult;
  /** 出参 schema 校验结果（执行后） */
  outputValidation?: SchemaValidationResult;
  /** 是否真正发起了外部调用 */
  executed: boolean;
  status: 'success' | 'failed' | 'denied' | 'need_confirm' | 'skipped';
  /** 原始请求（HTTP：method/url/headers/body；SQL：sql/values） */
  rawRequest?: unknown;
  /** 原始响应（HTTP：status/body；SQL：rows） */
  rawResponse?: unknown;
  /** 转换结果（归一化后的输出） */
  transformedResult?: unknown;
  durationMs: number;
  message: string;
}

/**
 * Tool 调用测试编排（执行计划 §4.4 / 架构 §8）。
 *
 * 链路：构造 Policy 上下文 → Policy.evaluate（执行前必走）→
 *   - deny / need_confirm：不执行外部调用（验收标准 2），直接返回决策；
 *   - allow：按 inputSchema 校验入参 → 校验通过则执行（query→SQL / action,notification→HTTP /
 *     workflow→编排见 12/13 暂不执行）→ 按 outputSchema 校验出参。
 * 全程记入 04 tool_call_audit；HTTP 调用额外记入 external_call_audit。
 */
@Injectable()
export class ToolTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly sqlTool: SqlToolService,
    private readonly toolService: ToolService,
    private readonly nl2Sql: Nl2SqlService,
    private readonly queryResult: QueryResultService,
  ) {}

  /** 通用调用测试（action / notification / workflow；query 型走模板或建议改用 SQL 测试）。 */
  async test(user: AuthUser, tool: Tool, dto: TestToolDto): Promise<ToolTestResult> {
    const params = dto.params ?? {};
    const decision = await this.evaluatePolicy(user, tool, JSON.stringify(params));

    // Policy 拒绝 / 需确认：不执行外部调用（验收标准 2）
    const shortCircuit = this.shortCircuitByPolicy(decision);
    if (shortCircuit) {
      await this.recordAudit(user, tool, {
        status: shortCircuit.status === 'denied' ? 'failed' : 'pending',
        durationMs: 0,
        highRisk: decision.highRisk,
        summary: shortCircuit.message,
      });
      return {
        policy: decision,
        inputValidation: { valid: true, errors: [] },
        executed: false,
        status: shortCircuit.status,
        durationMs: 0,
        message: shortCircuit.message,
      };
    }

    // 入参 schema 校验
    const inputValidation = validateAgainstSchema(tool.inputSchema, params);
    if (!inputValidation.valid) {
      await this.recordAudit(user, tool, {
        status: 'failed',
        durationMs: 0,
        highRisk: decision.highRisk,
        summary: `入参 schema 校验未通过：${inputValidation.errors.join('；')}`,
      });
      return {
        policy: decision,
        inputValidation,
        executed: false,
        status: 'failed',
        durationMs: 0,
        message: '入参未通过 inputSchema 校验，未执行调用',
      };
    }

    switch (tool.type) {
      case 'action':
      case 'notification':
        return this.executeHttp(user, tool, params, decision, inputValidation);
      case 'query':
        return this.executeQueryViaTemplate(user, tool, params, decision, inputValidation);
      case 'workflow':
      default:
        return {
          policy: decision,
          inputValidation,
          executed: false,
          status: 'skipped',
          durationMs: 0,
          message: '流程型工具的编排执行属于 12-Agent 运行时 / 13-四类能力，调用测试仅完成 Policy 与入参校验',
        };
    }
  }

  /** NL2SQL 试跑：仅生成 SQL，不执行（阶段 II 管理端）。 */
  async nl2sqlPreview(
    user: AuthUser,
    tool: Tool,
    dto: Nl2SqlPreviewDto,
  ): Promise<{
    sql: string;
    explanation: string;
    referencedTables: string[];
    params: Record<string, unknown>;
  }> {
    if (tool.type !== 'query') {
      throw new Error('仅查询型工具支持 NL2SQL 试跑');
    }
    const connector = await this.requireConnector(tool, 'db_readonly');
    const sqlConfig = this.readSqlConfig(tool);
    const decision = await this.evaluatePolicy(user, tool, dto.message);
    const shortCircuit = this.shortCircuitByPolicy(decision);
    if (shortCircuit) {
      throw new Error(shortCircuit.message);
    }

    const generated = await this.nl2Sql.generate({
      userMessage: dto.message,
      connectorId: connector.id,
      sqlConfig,
      templates: sqlConfig.templates,
      tenantId: tool.tenantId,
    });

    await this.recordAudit(user, tool, {
      status: 'success',
      durationMs: 0,
      highRisk: decision.highRisk,
      summary: `NL2SQL 预览 | tables: ${generated.referencedTables.join(', ') || '—'} | sql: ${generated.sql.slice(0, 300)}`,
    });

    return generated;
  }

  /**
   * 三步试跑（管理端）：NL2SQL → 执行 → 结果解读，与 Runtime 流水线对齐。
   */
  async queryE2ePreview(
    user: AuthUser,
    tool: Tool,
    dto: Nl2SqlPreviewDto,
  ): Promise<{
    nl2sql: {
      sql: string;
      explanation: string;
      referencedTables: string[];
      params: Record<string, unknown>;
    };
    execution: {
      rowCount: number;
      rows: Record<string, unknown>[];
      executedSql: string;
      durationMs: number;
    };
    reply: {
      text: string;
      summary: string;
      truncated: boolean;
      displayedRowCount: number;
    };
    totalDurationMs: number;
  }> {
    if (tool.type !== 'query') {
      throw new Error('仅查询型工具支持三步试跑');
    }
    const connector = await this.requireConnector(tool, 'db_readonly');
    const sqlConfig = this.readSqlConfig(tool);
    const decision = await this.evaluatePolicy(user, tool, dto.message);
    const shortCircuit = this.shortCircuitByPolicy(decision);
    if (shortCircuit) {
      throw new Error(shortCircuit.message);
    }

    const start = Date.now();

    const generated = await this.nl2Sql.generate({
      userMessage: dto.message,
      connectorId: connector.id,
      sqlConfig,
      templates: sqlConfig.templates,
      tenantId: tool.tenantId,
    });

    const exec = await this.sqlTool.execute(
      connector,
      generated.sql,
      generated.params ?? {},
      sqlConfig,
    );

    const summarized = await this.queryResult.summarize({
      userMessage: dto.message,
      rows: exec.rows,
      rowCount: exec.rowCount,
      tenantId: tool.tenantId,
    });

    const totalDurationMs = Date.now() - start;

    await this.recordExternalCall(
      user,
      tool,
      connector,
      'success',
      exec.durationMs,
      null,
    );
    await this.recordAudit(user, tool, {
      status: 'success',
      durationMs: totalDurationMs,
      highRisk: decision.highRisk,
      summary: `三步试跑 | tables: ${generated.referencedTables.join(', ') || '—'} | rows: ${exec.rowCount}`,
    });

    return {
      nl2sql: generated,
      execution: {
        rowCount: exec.rowCount,
        rows: exec.rows,
        executedSql: exec.executedSql,
        durationMs: exec.durationMs,
      },
      reply: {
        text: summarized.replyText,
        summary: summarized.summary,
        truncated: summarized.truncated,
        displayedRowCount: summarized.displayedRowCount,
      },
      totalDurationMs,
    };
  }

  /** SQL 查询工具测试（执行计划 §4.5 / 验收标准 3）。 */
  async sqlTest(user: AuthUser, tool: Tool, dto: TestSqlDto): Promise<ToolTestResult> {
    const sqlConfig = this.readSqlConfig(tool);
    const sql = this.resolveSql(dto, sqlConfig);
    const params = dto.params ?? {};
    const decision = await this.evaluatePolicy(user, tool, sql);

    const shortCircuit = this.shortCircuitByPolicy(decision);
    if (shortCircuit) {
      await this.recordAudit(user, tool, {
        status: shortCircuit.status === 'denied' ? 'failed' : 'pending',
        durationMs: 0,
        highRisk: decision.highRisk,
        summary: shortCircuit.message,
      });
      return {
        policy: decision,
        inputValidation: { valid: true, errors: [] },
        executed: false,
        status: shortCircuit.status,
        durationMs: 0,
        message: shortCircuit.message,
      };
    }

    const connector = await this.requireConnector(tool, 'db_readonly');
    let result: ToolTestResult;
    try {
      const exec = await this.sqlTool.execute(connector, sql, params, sqlConfig);
      const outputValidation = validateAgainstSchema(tool.outputSchema, exec.rows);
      result = {
        policy: decision,
        inputValidation: { valid: true, errors: [] },
        outputValidation,
        executed: true,
        status: 'success',
        rawRequest: { sql: exec.executedSql, values: exec.boundValues },
        rawResponse: { rowCount: exec.rowCount, rows: exec.rows },
        transformedResult: exec.rows,
        durationMs: exec.durationMs,
        message: exec.message,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordExternalCall(user, tool, connector, 'failed', 0, message);
      await this.recordAudit(user, tool, {
        status: 'failed',
        durationMs: 0,
        highRisk: decision.highRisk,
        summary: `SQL 测试失败：${message}`,
      });
      throw err;
    }

    await this.recordExternalCall(
      user,
      tool,
      connector,
      'success',
      result.durationMs,
      null,
    );
    await this.recordAudit(user, tool, {
      status: 'success',
      durationMs: result.durationMs,
      highRisk: decision.highRisk,
      summary: `SQL 测试成功，返回 ${result.rawResponse && (result.rawResponse as { rowCount: number }).rowCount} 行`,
    });
    return result;
  }

  // ── 执行实现 ─────────────────────────────────────────────

  private async executeHttp(
    user: AuthUser,
    tool: Tool,
    params: Record<string, unknown>,
    decision: PolicyDecision,
    inputValidation: SchemaValidationResult,
  ): Promise<ToolTestResult> {
    const expected = tool.type === 'notification' ? 'notification' : 'http';
    const connector = await this.requireConnector(tool, expected);
    const http = this.readHttpConfig(tool);
    const url = this.joinUrl(connector.target, http.path);
    const method = (http.method || 'POST').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      ...this.buildAuthHeaders(connector),
      ...(http.headers ?? {}),
    };
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const body = hasBody ? JSON.stringify(http.bodyTemplate ?? params) : undefined;

    const rawRequest = {
      method,
      url,
      headers: this.maskHeaders(headers),
      body: hasBody ? (http.bodyTemplate ?? params) : undefined,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tool.timeoutMs ?? 10000);
    const start = Date.now();
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const durationMs = Date.now() - start;
      const text = await res.text();
      const parsed = this.tryParseJson(text);
      const ok = res.status < 400;
      const outputValidation = ok
        ? validateAgainstSchema(tool.outputSchema, parsed)
        : undefined;

      await this.recordExternalCall(
        user,
        tool,
        connector,
        ok ? 'success' : 'failed',
        durationMs,
        ok ? null : `HTTP ${res.status}`,
        res.status,
      );
      await this.recordAudit(user, tool, {
        status: ok ? 'success' : 'failed',
        durationMs,
        highRisk: decision.highRisk,
        summary: `${method} ${url} → HTTP ${res.status}`,
      });

      return {
        policy: decision,
        inputValidation,
        outputValidation,
        executed: true,
        status: ok ? 'success' : 'failed',
        rawRequest,
        rawResponse: { status: res.status, body: parsed ?? text },
        transformedResult: parsed ?? text,
        durationMs,
        message: ok ? `调用成功（HTTP ${res.status}）` : `调用返回 HTTP ${res.status}`,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const aborted = err instanceof Error && err.name === 'AbortError';
      const message = aborted
        ? `调用超时（>${tool.timeoutMs}ms）`
        : `调用失败：${err instanceof Error ? err.message : String(err)}`;
      await this.recordExternalCall(user, tool, connector, 'failed', durationMs, message);
      await this.recordAudit(user, tool, {
        status: 'failed',
        durationMs,
        highRisk: decision.highRisk,
        summary: message,
      });
      return {
        policy: decision,
        inputValidation,
        executed: true,
        status: 'failed',
        rawRequest,
        durationMs,
        message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** query 型在通用调用测试中：取首个 SQL 模板执行；无模板则提示改用 SQL 测试。 */
  private async executeQueryViaTemplate(
    user: AuthUser,
    tool: Tool,
    params: Record<string, unknown>,
    decision: PolicyDecision,
    inputValidation: SchemaValidationResult,
  ): Promise<ToolTestResult> {
    const sqlConfig = this.readSqlConfig(tool);
    const template = sqlConfig.templates[0];
    if (!template) {
      return {
        policy: decision,
        inputValidation,
        executed: false,
        status: 'skipped',
        durationMs: 0,
        message: '查询型工具未配置 SQL 模板，请在「SQL 查询工具」页指定 SQL 进行测试',
      };
    }
    return this.sqlTest(user, tool, { sql: template.sql, params });
  }

  // ── Policy / 审计 / 工具方法 ─────────────────────────────

  private async evaluatePolicy(
    user: AuthUser,
    tool: Tool,
    requestSummary: string,
  ): Promise<PolicyDecision> {
    return this.policy.evaluate({
      tenantId: tool.tenantId,
      userId: user.id,
      callerName: user.username,
      toolId: tool.id,
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      needConfirmation: tool.needConfirmation,
      capability: TOOL_TYPE_CAPABILITY[tool.type],
      permissionScope: tool.permissionScope,
      requestSummary,
    });
  }

  private shortCircuitByPolicy(
    decision: PolicyDecision,
  ): { status: 'denied' | 'need_confirm'; message: string } | null {
    if (decision.result === 'deny') {
      return {
        status: 'denied',
        message: decision.reason ?? 'Policy 拒绝，已阻止执行（未发起外部调用）',
      };
    }
    // Tool 自身需确认 或 命中确认规则：中断转审批（14），测试不执行
    if (decision.needConfirm) {
      return {
        status: 'need_confirm',
        message: decision.reason ?? '需人工确认（转审批中心），调用测试未发起外部调用',
      };
    }
    return null;
  }

  private async recordAudit(
    user: AuthUser,
    tool: Tool,
    opts: {
      status: AuditStatus;
      durationMs: number;
      highRisk: boolean;
      summary: string;
    },
  ) {
    await this.audit.logToolCall({
      tenantId: tool.tenantId,
      toolId: tool.id,
      toolName: tool.name,
      callerUserId: user.id,
      callerName: user.username,
      requestSummary: `[调用测试] ${opts.summary}`,
      status: opts.status,
      durationMs: opts.durationMs,
      highRisk: opts.highRisk,
    });
  }

  private async recordExternalCall(
    user: AuthUser,
    tool: Tool,
    connector: Connector,
    status: AuditStatus,
    durationMs: number,
    errorMessage: string | null,
    statusCode?: number,
  ) {
    await this.audit.logExternalCall({
      tenantId: tool.tenantId,
      connectorId: connector.id,
      target: connector.target,
      method: connector.type === 'db_readonly' ? 'SQL' : 'HTTP',
      callerUserId: user.id,
      requestSummary: `[工具测试] ${tool.name}`,
      status,
      statusCode: statusCode ?? null,
      durationMs,
      errorMessage,
    });
  }

  private async requireConnector(tool: Tool, expectedType: string): Promise<Connector> {
    if (!tool.connectorId) {
      throw new Error('该工具未关联连接器，无法执行调用测试');
    }
    const connector = await this.prisma.connector.findUnique({
      where: { id: tool.connectorId },
    });
    if (!connector) throw new Error('关联连接器不存在或已删除');
    if (connector.status === 'disabled') throw new Error('关联连接器已停用');
    if (connector.type !== expectedType) {
      throw new Error(`关联连接器类型应为 ${expectedType}，当前为 ${connector.type}`);
    }
    return connector;
  }

  private readSqlConfig(tool: Tool): SqlToolConfig {
    const cfg = this.toolService.readConfig(tool).sql;
    return (
      cfg ?? { tableBlacklist: [], fieldBlacklist: [], maxRows: 100, maxExecutionMs: 3000, templates: [] }
    );
  }

  private readHttpConfig(tool: Tool): HttpToolConfig {
    return this.toolService.readConfig(tool).http ?? { method: 'POST', path: '' };
  }

  private resolveSql(dto: TestSqlDto, sqlConfig: SqlToolConfig): string {
    if (dto.sql && dto.sql.trim()) return dto.sql;
    if (dto.templateId) {
      const tpl = sqlConfig.templates.find((t) => t.id === dto.templateId);
      if (!tpl) throw new Error(`SQL 模板不存在：${dto.templateId}`);
      return tpl.sql;
    }
    throw new Error('请提供 SQL 或选择 SQL 模板');
  }

  private buildAuthHeaders(connector: Connector): Record<string, string> {
    const secret = decryptSecret(
      (connector.config as { secretCipher?: string | null })?.secretCipher,
    );
    const headers: Record<string, string> = {};
    if (!secret) return headers;
    switch (connector.authType) {
      case 'basic': {
        const u = String(secret.username ?? '');
        const p = String(secret.password ?? '');
        headers.Authorization = `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
        break;
      }
      case 'bearer':
        if (secret.token) headers.Authorization = `Bearer ${String(secret.token)}`;
        break;
      case 'api_key': {
        const name = String(secret.headerName ?? 'X-API-Key');
        if (secret.apiKey) headers[name] = String(secret.apiKey);
        break;
      }
      case 'custom':
        for (const [k, v] of Object.entries(secret)) {
          if (k.startsWith('header.')) headers[k.slice('header.'.length)] = String(v);
        }
        break;
      default:
        break;
    }
    return headers;
  }

  /** 回显请求头时脱敏 Authorization / 密钥头 */
  private maskHeaders(headers: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      out[k] = /authorization|key|token|secret/i.test(k) ? '******' : v;
    }
    return out;
  }

  private joinUrl(base: string, path: string): string {
    if (!path) return base;
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  private tryParseJson(text: string): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
