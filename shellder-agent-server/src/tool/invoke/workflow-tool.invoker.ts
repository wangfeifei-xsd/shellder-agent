import { Injectable } from '@nestjs/common';
import { Connector, Tool } from '@prisma/client';
import { PrincipalContext } from '../../agent-runtime/agent-runtime.types';
import { ErDiagramService } from '../../connector/er-diagram.service';
import { DataScopeResolveService } from '../../query/data-scope-resolve.service';
import { Nl2SqlService } from '../../query/nl2sql.service';
import { SqlScopeFilterService } from '../../query/sql-scope-filter.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SqlToolService } from '../sql-tool.service';
import { ToolService } from '../tool.service';
import { ToolInvocationService } from '../tool-invocation.service';
import { InvokeContext } from '../tool-invocation.types';
import { SqlToolConfig } from '../tool.types';
import { HttpQueryTriggerService } from '../http-query-trigger.service';
import { mergeHttpQueryParams } from '../http-query-param.util';
import { WorkflowStep } from '../tool.types';
import { coerceWorkflowParams, resolveStepParamBindings } from '../workflow-step-params.util';

export interface WorkflowSubToolContext {
  tenantId: string;
  userId: string;
  userMessage: string;
  sessionId?: string;
  callerName?: string;
  source: 'runtime' | 'worker';
  /** 问数行级范围（与查询型 Runtime 一致） */
  principalContext?: PrincipalContext;
}

export interface WorkflowSubToolOptions {
  visitedToolIds?: Set<string>;
  depth?: number;
  /** 当前步骤定义（含入参绑定） */
  step?: WorkflowStep;
  /** 当前步骤序号（0-based） */
  stepIndex?: number;
  /** 已完成步骤的输出，按顺序 */
  previousStepOutputs?: unknown[];
}

const MAX_WORKFLOW_DEPTH = 10;

/**
 * 流程型子 Tool 执行（query / action / notification / http_query）。
 * 统一委托 ToolInvocationService / 查询型 NL2SQL 流水线，含深度与循环检测。
 */
@Injectable()
export class WorkflowToolInvoker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invocation: ToolInvocationService,
    private readonly sqlTool: SqlToolService,
    private readonly toolService: ToolService,
    private readonly erDiagram: ErDiagramService,
    private readonly dataScopeResolve: DataScopeResolveService,
    private readonly nl2Sql: Nl2SqlService,
    private readonly sqlScopeFilter: SqlScopeFilterService,
    private readonly httpQueryTrigger: HttpQueryTriggerService,
  ) {}

  async executeSubTool(
    toolId: string,
    ctx: WorkflowSubToolContext,
    opts: WorkflowSubToolOptions = {},
  ): Promise<unknown> {
    const depth = opts.depth ?? 0;
    if (depth > MAX_WORKFLOW_DEPTH) {
      throw new Error(`流程嵌套深度超过 ${MAX_WORKFLOW_DEPTH} 层限制`);
    }

    const visited = opts.visitedToolIds ?? new Set<string>();
    if (visited.has(toolId)) {
      throw new Error(`流程步骤存在循环引用：toolId=${toolId}`);
    }
    visited.add(toolId);

    const tool = await this.prisma.tool.findUnique({
      where: { id: toolId },
      include: { connector: true },
    });
    if (!tool) throw new Error(`子工具 ${toolId} 不存在`);
    if (tool.status === 'disabled') throw new Error(`子工具「${tool.name}」已停用`);

    switch (tool.type) {
      case 'query':
        return this.executeQuerySubTool(tool, ctx);
      case 'action':
      case 'notification': {
        const params = this.resolveStepInvokeParams(tool.type, tool, ctx, opts);
        return this.invokeHttpLikeTool(tool, params, ctx);
      }
      case 'http_query': {
        const params = await this.resolveHttpQueryStepParams(tool, ctx, opts);
        return this.invokeHttpLikeTool(tool, params, ctx);
      }
      case 'workflow':
        throw new Error('不支持 workflow 嵌套 workflow 子工具');
      default:
        return { message: `子工具类型 ${tool.type} 暂不支持嵌套编排` };
    }
  }

  private async executeQuerySubTool(
    tool: Tool & { connector: Connector | null },
    ctx: WorkflowSubToolContext,
  ): Promise<unknown> {
    if (!tool.connector) throw new Error(`查询子工具「${tool.name}」未关联连接器`);
    if (tool.connector.type !== 'db_readonly') {
      throw new Error(`查询子工具「${tool.name}」连接器类型非 db_readonly`);
    }
    if (tool.connector.status === 'disabled') {
      throw new Error(`关联连接器「${tool.connector.name}」已停用`);
    }

    const userMessage = ctx.userMessage?.trim();
    if (!userMessage) {
      throw new Error(`查询子工具「${tool.name}」需要用户输入以生成 SQL，当前会话无有效问句`);
    }

    const sqlConfig = this.readSqlConfig(tool);
    const startTime = Date.now();

    const published = await this.erDiagram.getPublished(tool.connector.id);
    if (!published?.tables?.length) {
      throw new Error(
        '连接器尚无已发布 ER 关系图，流程内查询不可用。请先在「库表 ER 图」中发布关系图。',
      );
    }

    const resolved = this.dataScopeResolve.resolve(ctx.principalContext, published);

    const generated = await this.nl2Sql.generate({
      userMessage,
      connectorId: tool.connector.id,
      sqlConfig,
      templates: sqlConfig.templates,
      tenantId: ctx.tenantId,
      scopeContext: resolved.scopeContextText,
    });

    const scoped = this.sqlScopeFilter.apply(
      generated.sql,
      generated.referencedTables,
      resolved,
      generated.params ?? {},
    );

    const result = await this.sqlTool.execute(
      tool.connector,
      scoped.sql,
      scoped.params,
      sqlConfig,
    );

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      durationMs: Date.now() - startTime,
      sql: scoped.sql,
      explanation: generated.explanation,
      referencedTables: generated.referencedTables,
      appliedScopeFilters: scoped.appliedScopeFilters,
    };
  }

  private resolveStepInvokeParams(
    _toolType: string,
    _tool: Tool,
    ctx: WorkflowSubToolContext,
    opts: WorkflowSubToolOptions,
  ): Record<string, unknown> {
    const configured = resolveStepParamBindings(
      opts.step?.paramBindings,
      opts.previousStepOutputs ?? [],
      opts.stepIndex ?? 0,
    );
    return coerceWorkflowParams(_tool.inputSchema, {
      message: ctx.userMessage,
      ...configured,
    });
  }

  private async resolveHttpQueryStepParams(
    tool: Tool,
    ctx: WorkflowSubToolContext,
    opts: WorkflowSubToolOptions,
  ): Promise<Record<string, unknown>> {
    const configured = resolveStepParamBindings(
      opts.step?.paramBindings,
      opts.previousStepOutputs ?? [],
      opts.stepIndex ?? 0,
    );
    const { params: extracted } = await this.httpQueryTrigger.resolveInvokeParams(
      tool,
      ctx.userMessage,
    );
    const merged = mergeHttpQueryParams(extracted, configured);
    return coerceWorkflowParams(tool.inputSchema, merged);
  }

  private readSqlConfig(tool: Tool): SqlToolConfig {
    const config = this.toolService.readConfig(tool).sql;
    return (
      config ?? {
        tableBlacklist: [],
        fieldBlacklist: [],
        maxRows: 100,
        maxExecutionMs: 3000,
        templates: [],
      }
    );
  }

  private async invokeHttpLikeTool(
    tool: Tool,
    params: Record<string, unknown>,
    ctx: WorkflowSubToolContext,
  ): Promise<unknown> {
    const invokeCtx: InvokeContext = {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      callerName: ctx.callerName,
      sessionId: ctx.sessionId,
      source: ctx.source,
      skipPolicy: true,
      principal: ctx.principalContext,
      requestSummary: `[Workflow/${tool.name}] ${ctx.userMessage}`.slice(0, 256),
    };

    const result = await this.invocation.invoke(tool, params, invokeCtx);
    if (result.status !== 'success') {
      throw new Error(result.message);
    }

    return {
      status:
        result.rawResponse &&
        typeof result.rawResponse === 'object' &&
        'status' in (result.rawResponse as object)
          ? (result.rawResponse as { status: number }).status
          : undefined,
      data: result.transformedResult,
      responseType: result.responseType,
    };
  }
}
