import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Connector, Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Nl2SqlService } from '../query/nl2sql.service';
import { QueryResultService } from '../query/query-result.service';
import { SqlToolService } from '../tool/sql-tool.service';
import { ToolService } from '../tool/tool.service';
import {
  CapabilityHandler,
  CapabilityHandlerResult,
  RuntimeContext,
  SseEvent,
} from '../agent-runtime/agent-runtime.types';
import { CapabilityResult } from './capability-result';
import { SqlToolConfig } from '../tool/tool.types';

/**
 * 查询型能力 Handler（§5 / 运行期三步流水线）。
 *
 * 编排：已发布 ER → ① Nl2SqlService → ② SqlToolService → ③ QueryResultService。
 * Policy 由 Agent Runtime 在 Handler 前统一评估。
 */
@Injectable()
export class QueryCapabilityHandler implements CapabilityHandler {
  readonly type = 'query';
  private readonly logger = new Logger(QueryCapabilityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sqlToolService: SqlToolService,
    private readonly toolService: ToolService,
    private readonly nl2Sql: Nl2SqlService,
    private readonly queryResult: QueryResultService,
  ) {}

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    const toolIds = ctx.toolIds ?? [];
    if (toolIds.length === 0) {
      return this.fail(ctx, emitSse, '未指定查询工具（Query Tool），无法执行查询型能力。请检查路由配置。');
    }

    const tool = await this.prisma.tool.findUnique({
      where: { id: toolIds[0] },
      include: { connector: true },
    });

    const precheck = this.validateTool(tool, toolIds[0]);
    if (precheck) {
      return this.fail(ctx, emitSse, precheck);
    }

    const queryTool = tool!;
    const connector = queryTool.connector!;

    emitSse({
      event: 'tool_start',
      data: {
        toolName: queryTool.name,
        toolId: queryTool.id,
        input: { query: ctx.userMessage },
      },
    });

    const startTime = Date.now();
    const sqlConfig = this.readSqlConfig(queryTool);

    try {
      const generated = await this.nl2Sql.generate({
        userMessage: ctx.userMessage,
        connectorId: connector.id,
        sqlConfig,
        templates: sqlConfig.templates,
        tenantId: ctx.tenantId,
      });

      const execResult = await this.sqlToolService.execute(
        connector,
        generated.sql,
        generated.params,
        sqlConfig,
      );

      const durationMs = Date.now() - startTime;
      const auditSummary = this.buildAuditSummary(
        ctx.userMessage,
        generated.sql,
        generated.referencedTables,
      );

      emitSse({
        event: 'tool_end',
        data: {
          toolName: queryTool.name,
          toolId: queryTool.id,
          status: 'success',
          durationMs,
          output: {
            rowCount: execResult.rowCount,
            referencedTables: generated.referencedTables,
            sql: this.maskSqlForAudit(generated.sql),
          },
        },
      });

      const textChunks: string[] = [];
      const summarized = await this.queryResult.summarize(
        {
          userMessage: ctx.userMessage,
          rows: execResult.rows,
          rowCount: execResult.rowCount,
          tenantId: ctx.tenantId,
        },
        async (delta) => {
          textChunks.push(delta);
          emitSse({ event: 'delta', data: { text: delta } });
        },
      );

      const result: CapabilityResult = {
        capabilityType: 'query',
        data: {
          text: summarized.replyText,
          rows: execResult.rows,
          rowCount: execResult.rowCount,
          sql: generated.sql,
          explanation: generated.explanation,
          executedSql: execResult.executedSql,
          referencedTables: generated.referencedTables,
        },
        status: 'success',
      };

      return {
        success: true,
        output: result,
        textChunks,
        auditRequestSummary: auditSummary,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const { code, errorMsg } = this.normalizeError(err);

      this.logger.error(`查询型能力执行失败 tool=${queryTool.name}: ${errorMsg}`);

      emitSse({
        event: 'tool_end',
        data: {
          toolName: queryTool.name,
          toolId: queryTool.id,
          status: 'failed',
          durationMs,
          error: errorMsg,
        },
      });
      emitSse({ event: 'delta', data: { text: errorMsg } });
      if (code) {
        emitSse({ event: 'error', data: { code, message: errorMsg } });
      }

      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: errorMsg, rows: [], code },
        status: 'failed',
        error: errorMsg,
      };

      return {
        success: false,
        output: result,
        error: errorMsg,
        auditRequestSummary: `[query] ${errorMsg}`,
      };
    }
  }

  private validateTool(
    tool: (Tool & { connector: Connector | null }) | null,
    toolId: string,
  ): string | null {
    if (!tool || tool.type !== 'query') {
      return `工具 ${toolId} 不存在或非查询型`;
    }
    if (tool.status === 'disabled') {
      return `查询工具「${tool.name}」已停用`;
    }
    if (!tool.connector) {
      return `查询工具「${tool.name}」未关联数据库连接器`;
    }
    if (tool.connector.type !== 'db_readonly') {
      return `查询工具「${tool.name}」关联的连接器类型非 db_readonly`;
    }
    if (tool.connector.status === 'disabled') {
      return `关联连接器「${tool.connector.name}」已停用`;
    }
    return null;
  }

  private fail(
    _ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
    msg: string,
  ): CapabilityHandlerResult {
    emitSse({ event: 'delta', data: { text: msg } });
    const result: CapabilityResult = {
      capabilityType: 'query',
      data: { text: msg, rows: [] },
      status: 'failed',
      error: msg,
    };
    return { success: false, output: result, error: msg };
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

  private normalizeError(err: unknown): { code?: string; errorMsg: string } {
    if (err instanceof BadRequestException) {
      const res = err.getResponse();
      if (typeof res === 'object' && res !== null) {
        const o = res as { code?: string; message?: string | string[] };
        const msg = Array.isArray(o.message)
          ? o.message.join('；')
          : String(o.message ?? err.message);
        return { code: o.code, errorMsg: msg };
      }
    }
    return {
      errorMsg: err instanceof Error ? err.message : String(err),
    };
  }

  private buildAuditSummary(
    userMessage: string,
    sql: string,
    referencedTables: string[],
  ): string {
    const tables = referencedTables.length ? referencedTables.join(', ') : '—';
    return `[query] NL: ${userMessage.slice(0, 200)} | tables: ${tables} | sql: ${this.maskSqlForAudit(sql).slice(0, 500)}`;
  }

  private maskSqlForAudit(sql: string): string {
    return sql.replace(/'[^']*'/g, "'***'");
  }
}
