import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
 * 查询型能力 Handler（§5.2）。
 *
 * 基于只读 SQL 执行查询（V1 不通过 HTTP 查数）：
 * - 执行已注册 Query Tool（07 SQL 配置）
 * - 连接器类型：只读数据库（06）
 * - 执行原则：表白名单、行数、时长、字段限制（§8）
 * - 非白名单表拒绝执行（验收标准 2）
 */
@Injectable()
export class QueryCapabilityHandler implements CapabilityHandler {
  readonly type = 'query';
  private readonly logger = new Logger(QueryCapabilityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sqlToolService: SqlToolService,
    private readonly toolService: ToolService,
  ) {}

  async execute(
    ctx: RuntimeContext,
    emitSse: (e: SseEvent) => void,
  ): Promise<CapabilityHandlerResult> {
    const toolIds = ctx.toolIds ?? [];
    if (toolIds.length === 0) {
      const msg = '未指定查询工具（Query Tool），无法执行查询型能力。请检查路由配置。';
      emitSse({ event: 'delta', data: { text: msg } });

      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: msg, rows: [] },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    const toolId = toolIds[0];
    const tool = await this.prisma.tool.findUnique({
      where: { id: toolId },
      include: { connector: true },
    });

    if (!tool || tool.type !== 'query') {
      const msg = `工具 ${toolId} 不存在或非查询型`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: msg, rows: [] },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (tool.status === 'disabled') {
      const msg = `查询工具「${tool.name}」已停用`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: msg, rows: [] },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (!tool.connector) {
      const msg = `查询工具「${tool.name}」未关联数据库连接器`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: msg, rows: [] },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (tool.connector.type !== 'db_readonly') {
      const msg = `查询工具「${tool.name}」关联的连接器类型非 db_readonly`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: msg, rows: [] },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    if (tool.connector.status === 'disabled') {
      const msg = `关联连接器「${tool.connector.name}」已停用`;
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: msg, rows: [] },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    emitSse({
      event: 'tool_start',
      data: { toolName: tool.name, toolId: tool.id, input: { query: ctx.userMessage } },
    });

    const startTime = Date.now();
    const sqlConfig = this.readSqlConfig(tool);

    const sql = this.resolveSql(ctx.userMessage, sqlConfig);
    if (!sql) {
      const durationMs = Date.now() - startTime;
      const msg = `查询工具「${tool.name}」未配置 SQL 模板，且无法从用户输入解析 SQL`;
      emitSse({
        event: 'tool_end',
        data: { toolName: tool.name, toolId: tool.id, status: 'failed', durationMs, error: msg },
      });
      emitSse({ event: 'delta', data: { text: msg } });
      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: msg, rows: [] },
        status: 'failed',
        error: msg,
      };
      return { success: false, output: result, error: msg };
    }

    try {
      const params = this.extractParams(ctx.userMessage, sql);
      const execResult = await this.sqlToolService.execute(
        tool.connector,
        sql,
        params,
        sqlConfig,
      );

      const durationMs = Date.now() - startTime;

      emitSse({
        event: 'tool_end',
        data: {
          toolName: tool.name,
          toolId: tool.id,
          status: 'success',
          durationMs,
          output: { rowCount: execResult.rowCount },
        },
      });

      const replyText = this.formatResult(tool.name, execResult.rows, execResult.rowCount);
      const chunks = this.splitText(replyText, 80);
      for (const chunk of chunks) {
        emitSse({ event: 'delta', data: { text: chunk } });
      }

      const result: CapabilityResult = {
        capabilityType: 'query',
        data: {
          text: replyText,
          rows: execResult.rows,
          rowCount: execResult.rowCount,
          executedSql: execResult.executedSql,
        },
        status: 'success',
      };

      return { success: true, output: result, textChunks: chunks };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`查询型能力执行失败 tool=${tool.name}: ${errorMsg}`);

      emitSse({
        event: 'tool_end',
        data: { toolName: tool.name, toolId: tool.id, status: 'failed', durationMs, error: errorMsg },
      });
      emitSse({ event: 'delta', data: { text: `查询执行失败：${errorMsg}` } });

      const result: CapabilityResult = {
        capabilityType: 'query',
        data: { text: `查询执行失败：${errorMsg}`, rows: [] },
        status: 'failed',
        error: errorMsg,
      };

      return { success: false, output: result, error: errorMsg };
    }
  }

  private readSqlConfig(tool: Tool): SqlToolConfig {
    const config = (tool.config as any)?.sql;
    return config ?? { tableWhitelist: [], fieldWhitelist: [], maxRows: 100, maxExecutionMs: 3000, templates: [] };
  }

  private resolveSql(userMessage: string, sqlConfig: SqlToolConfig): string | null {
    if (sqlConfig.templates && sqlConfig.templates.length > 0) {
      const match = this.matchTemplate(userMessage, sqlConfig.templates);
      if (match) return match.sql;
      return sqlConfig.templates[0].sql;
    }
    return null;
  }

  private matchTemplate(
    input: string,
    templates: { id: string; name: string; sql: string; description?: string }[],
  ): { id: string; name: string; sql: string } | null {
    const lower = input.toLowerCase();
    for (const tpl of templates) {
      const keywords = [tpl.name, tpl.description ?? ''].join(' ').toLowerCase();
      const words = keywords.split(/\s+/).filter((w) => w.length > 1);
      const hits = words.filter((w) => lower.includes(w));
      if (hits.length > 0) return tpl;
    }
    return null;
  }

  private extractParams(userMessage: string, sql: string): Record<string, unknown> {
    const paramNames = [...sql.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]);
    const params: Record<string, unknown> = {};
    for (const name of paramNames) {
      const numberMatch = userMessage.match(/\d+/);
      if (numberMatch) {
        params[name] = numberMatch[0];
      } else {
        params[name] = userMessage;
      }
    }
    return params;
  }

  private formatResult(
    toolName: string,
    rows: Record<string, unknown>[],
    rowCount: number,
  ): string {
    if (rowCount === 0) {
      return `查询工具「${toolName}」执行完成，未查到符合条件的数据。`;
    }

    const header = `查询工具「${toolName}」返回 ${rowCount} 条结果：\n\n`;
    const maxDisplay = Math.min(rows.length, 10);
    const displayRows = rows.slice(0, maxDisplay);

    if (displayRows.length === 0) return header + '（无数据）';

    const columns = Object.keys(displayRows[0]);
    const tableHeader = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const tableRows = displayRows.map(
      (row) => `| ${columns.map((col) => String(row[col] ?? '')).join(' | ')} |`,
    );

    let table = [tableHeader, separator, ...tableRows].join('\n');
    if (rowCount > maxDisplay) {
      table += `\n\n（仅展示前 ${maxDisplay} 条，共 ${rowCount} 条）`;
    }

    return header + table;
  }

  private splitText(text: string, chunkSize: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      result.push(text.slice(i, i + chunkSize));
    }
    return result;
  }
}
