import { Injectable } from '@nestjs/common';
import { Tool } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SqlToolService } from '../sql-tool.service';
import { ToolService } from '../tool.service';
import { ToolInvocationService } from '../tool-invocation.service';
import { InvokeContext } from '../tool-invocation.types';
import { SqlToolConfig } from '../tool.types';
import { parseHttpQuerySignal } from '../http-query-signal.util';

export interface WorkflowSubToolContext {
  tenantId: string;
  userId: string;
  userMessage: string;
  sessionId?: string;
  callerName?: string;
  source: 'runtime' | 'worker';
}

export interface WorkflowSubToolOptions {
  visitedToolIds?: Set<string>;
  depth?: number;
}

const MAX_WORKFLOW_DEPTH = 10;

/**
 * 流程型子 Tool 执行（query / action / notification / http_query）。
 * 统一委托 ToolInvocationService / SqlToolService，含深度与循环检测。
 */
@Injectable()
export class WorkflowToolInvoker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invocation: ToolInvocationService,
    private readonly sqlTool: SqlToolService,
    private readonly toolService: ToolService,
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
      case 'notification':
        return this.invokeHttpLikeTool(tool, { message: ctx.userMessage }, ctx);
      case 'http_query': {
        const signal = parseHttpQuerySignal(ctx.userMessage);
        const params = signal?.params ?? {};
        return this.invokeHttpLikeTool(tool, params, ctx);
      }
      case 'workflow':
        throw new Error('不支持 workflow 嵌套 workflow 子工具');
      default:
        return { message: `子工具类型 ${tool.type} 暂不支持嵌套编排` };
    }
  }

  private async executeQuerySubTool(
    tool: Tool & { connector: { type: string } | null },
    _ctx: WorkflowSubToolContext,
  ): Promise<unknown> {
    if (!tool.connector) throw new Error(`查询子工具「${tool.name}」未关联连接器`);
    if (tool.connector.type !== 'db_readonly') {
      throw new Error(`查询子工具「${tool.name}」连接器类型非 db_readonly`);
    }

    const sqlConfig: SqlToolConfig =
      this.toolService.readConfig(tool).sql ?? {
        tableBlacklist: [],
        fieldBlacklist: [],
        maxRows: 100,
        maxExecutionMs: 3000,
        templates: [],
      };

    const sql = sqlConfig.templates?.[0]?.sql;
    if (!sql) throw new Error(`查询子工具「${tool.name}」无 SQL 模板`);

    const result = await this.sqlTool.execute(tool.connector as any, sql, {}, sqlConfig);
    return { rows: result.rows, rowCount: result.rowCount, durationMs: result.durationMs };
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
