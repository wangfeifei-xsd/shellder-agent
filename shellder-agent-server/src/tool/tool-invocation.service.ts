import { Injectable } from '@nestjs/common';
import { AuditStatus, Connector, Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PolicyService } from '../policy/policy.service';
import { PolicyDecision } from '../policy/policy.types';
import { HttpToolInvoker } from './invoke/http-tool.invoker';
import { validateAgainstSchema } from './schema-validator.util';
import { ToolService } from './tool.service';
import { HttpToolConfig, TOOL_TYPE_CAPABILITY } from './tool.types';
import {
  httpQueryToHttpConfig,
  httpQueryToResponseMapping,
} from './http-query.config.util';
import { InvokeContext, ToolInvokeResult } from './tool-invocation.types';

/**
 * Tool 统一调用编排（Policy → Schema → Invoker → Audit）。
 * Phase 1：action / notification HTTP；query / workflow 仍由各自 Service 处理。
 */
@Injectable()
export class ToolInvocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly toolService: ToolService,
    private readonly httpInvoker: HttpToolInvoker,
  ) {}

  async invoke(
    tool: Tool,
    params: Record<string, unknown>,
    ctx: InvokeContext,
  ): Promise<ToolInvokeResult> {
    const requestSummary =
      ctx.requestSummary ?? JSON.stringify(params).slice(0, 256);

    let decision: PolicyDecision;
    if (ctx.skipPolicy) {
      decision = {
        result: 'allow',
        allow: true,
        needConfirm: false,
        highRisk: tool.riskLevel === 'high',
        matchedRules: [],
      };
    } else {
      decision = await this.policy.evaluate({
        tenantId: tool.tenantId,
        userId: ctx.userId,
        callerName: ctx.callerName,
        toolId: tool.id,
        toolName: tool.name,
        riskLevel: tool.riskLevel,
        needConfirmation: tool.needConfirmation,
        capability: TOOL_TYPE_CAPABILITY[tool.type],
        permissionScope: tool.permissionScope,
        requestSummary,
        sessionId: ctx.sessionId,
      });
    }

    const shortCircuit = this.shortCircuitByPolicy(decision);
    if (shortCircuit) {
      await this.recordToolCallAudit(tool, ctx, {
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

    const inputValidation = validateAgainstSchema(tool.inputSchema, params);
    if (!inputValidation.valid) {
      await this.recordToolCallAudit(tool, ctx, {
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
        return this.invokeHttp(tool, params, ctx, decision, inputValidation);
      case 'http_query':
        return this.invokeHttpQuery(tool, params, ctx, decision, inputValidation);
      default:
        return {
          policy: decision,
          inputValidation,
          executed: false,
          status: 'skipped',
          durationMs: 0,
          message: `ToolInvocationService 暂不支持类型 ${tool.type} 的统一调用`,
        };
    }
  }

  private async invokeHttpQuery(
    tool: Tool,
    params: Record<string, unknown>,
    ctx: InvokeContext,
    decision: PolicyDecision,
    inputValidation: ReturnType<typeof validateAgainstSchema>,
  ): Promise<ToolInvokeResult> {
    const httpQuery = this.toolService.readConfig(tool).httpQuery;
    if (!httpQuery) {
      return {
        policy: decision,
        inputValidation,
        executed: false,
        status: 'failed',
        durationMs: 0,
        message: 'HTTP 查询工具 config.httpQuery 未配置',
      };
    }

    const connector = await this.requireConnector(tool, 'http');
    const http = httpQueryToHttpConfig(httpQuery);
    const responseMapping = httpQueryToResponseMapping(httpQuery);
    const effectiveTool =
      httpQuery.invoke.timeoutMs != null
        ? { ...tool, timeoutMs: httpQuery.invoke.timeoutMs }
        : tool;

    const result = await this.httpInvoker.invoke({
      tool: effectiveTool,
      connector,
      http,
      params,
      ctx,
      responseMapping,
    });

    const outputValidation = result.httpOk
      ? validateAgainstSchema(tool.outputSchema, result.mapped.transformedResult)
      : undefined;

    const auditPrefix = ctx.source === 'admin_test' ? '[调用测试]' : `[Runtime]`;
    const summary = `${auditPrefix} ${result.rawRequest.method} ${result.rawRequest.url} → HTTP ${result.statusCode || '—'}`;

    await this.recordExternalCall(
      tool,
      connector,
      ctx,
      result.httpOk ? 'success' : 'failed',
      result.durationMs,
      result.errorMessage ?? null,
      result.statusCode || undefined,
    );

    if (ctx.source === 'admin_test') {
      await this.recordToolCallAudit(tool, ctx, {
        status: result.mapped.success ? 'success' : 'failed',
        durationMs: result.durationMs,
        highRisk: decision.highRisk,
        summary,
      });
    }

    let message =
      result.mapped.message ??
      (result.httpOk
        ? `调用成功（HTTP ${result.statusCode}）`
        : result.errorMessage ?? `调用返回 HTTP ${result.statusCode}`);

    if (result.mapped.success && result.mapped.replyText) {
      message = result.mapped.replyText;
    }

    return {
      policy: decision,
      inputValidation,
      outputValidation,
      executed: true,
      status: result.mapped.success ? 'success' : 'failed',
      rawRequest: result.rawRequest,
      rawResponse: result.rawResponse,
      transformedResult: result.mapped.transformedResult,
      responseType: result.mapped.responseType,
      durationMs: result.durationMs,
      message,
    };
  }

  private async invokeHttp(
    tool: Tool,
    params: Record<string, unknown>,
    ctx: InvokeContext,
    decision: PolicyDecision,
    inputValidation: ReturnType<typeof validateAgainstSchema>,
  ): Promise<ToolInvokeResult> {
    const expected = tool.type === 'notification' ? 'notification' : 'http';
    const connector = await this.requireConnector(tool, expected);
    const http = this.readHttpConfig(tool);

    const result = await this.httpInvoker.invoke({
      tool,
      connector,
      http,
      params,
      ctx,
      responseMapping: http.responseMapping,
    });

    const outputValidation = result.httpOk
      ? validateAgainstSchema(tool.outputSchema, result.mapped.transformedResult)
      : undefined;

    const auditPrefix = ctx.source === 'admin_test' ? '[调用测试]' : `[Runtime]`;
    const summary = `${auditPrefix} ${result.rawRequest.method} ${result.rawRequest.url} → HTTP ${result.statusCode || '—'}`;

    await this.recordExternalCall(tool, connector, ctx, result.httpOk ? 'success' : 'failed', result.durationMs, result.errorMessage ?? null, result.statusCode || undefined);

    if (ctx.source === 'admin_test') {
      await this.recordToolCallAudit(tool, ctx, {
        status: result.mapped.success ? 'success' : 'failed',
        durationMs: result.durationMs,
        highRisk: decision.highRisk,
        summary,
      });
    }

    const message =
      result.mapped.message ??
      (result.httpOk
        ? `调用成功（HTTP ${result.statusCode}）`
        : result.errorMessage ?? `调用返回 HTTP ${result.statusCode}`);

    return {
      policy: decision,
      inputValidation,
      outputValidation,
      executed: true,
      status: result.mapped.success ? 'success' : 'failed',
      rawRequest: result.rawRequest,
      rawResponse: result.rawResponse,
      transformedResult: result.mapped.transformedResult,
      responseType: result.mapped.responseType,
      durationMs: result.durationMs,
      message,
    };
  }

  private shortCircuitByPolicy(
    decision: PolicyDecision,
  ): { status: 'denied' | 'need_confirm'; message: string } | null {
    if (decision.result === 'deny' || !decision.allow) {
      return {
        status: 'denied',
        message: decision.reason ?? 'Policy 拒绝，已阻止执行（未发起外部调用）',
      };
    }
    if (decision.needConfirm) {
      return {
        status: 'need_confirm',
        message: decision.reason ?? '需人工确认（转审批中心），调用未发起外部调用',
      };
    }
    return null;
  }

  private async requireConnector(tool: Tool, expectedType: string): Promise<Connector> {
    if (!tool.connectorId) {
      throw new Error('该工具未关联连接器，无法执行调用');
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

  private readHttpConfig(tool: Tool): HttpToolConfig {
    return this.toolService.readConfig(tool).http ?? { method: 'POST', path: '' };
  }

  private async recordToolCallAudit(
    tool: Tool,
    ctx: InvokeContext,
    opts: { status: AuditStatus; durationMs: number; highRisk: boolean; summary: string },
  ) {
    await this.audit.logToolCall({
      tenantId: tool.tenantId,
      toolId: tool.id,
      toolName: tool.name,
      callerUserId: ctx.userId,
      callerName: ctx.callerName,
      sessionId: ctx.sessionId,
      requestSummary: opts.summary,
      status: opts.status,
      durationMs: opts.durationMs,
      highRisk: opts.highRisk,
    });
  }

  private async recordExternalCall(
    tool: Tool,
    connector: Connector,
    ctx: InvokeContext,
    status: AuditStatus,
    durationMs: number,
    errorMessage: string | null,
    statusCode?: number,
  ) {
    const prefix = ctx.source === 'admin_test' ? '[工具测试]' : `[${tool.name}]`;
    await this.audit.logExternalCall({
      tenantId: tool.tenantId,
      connectorId: connector.id,
      target: connector.target,
      method: 'HTTP',
      callerUserId: ctx.userId,
      requestSummary: `${prefix} ${ctx.requestSummary ?? tool.name}`.slice(0, 256),
      status,
      statusCode: statusCode ?? null,
      durationMs,
      errorMessage,
    });
  }
}
