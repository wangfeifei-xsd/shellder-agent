import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { llmNotConfigured } from '../llm/llm.errors';
import { ErDiagram, ErTableNode } from '../connector/connector-schema.types';
import { ErDiagramService } from '../connector/er-diagram.service';
import { PROMPT_KEYS } from '../prompt/prompt-keys';
import { PromptResolverService } from '../prompt/prompt-resolver.service';
import { SqlToolService } from '../tool/sql-tool.service';
import { LegacySqlToolConfig, SqlTemplate, SqlToolConfig } from '../tool/tool.types';
import { buildNl2SqlUserVariables } from './nl2sql.variables';

export interface Nl2SqlGenerateResult {
  sql: string;
  explanation: string;
  referencedTables: string[];
  params: Record<string, unknown>;
}

export interface Nl2SqlGenerateInput {
  userMessage: string;
  connectorId: string;
  sqlConfig: SqlToolConfig;
  templates?: SqlTemplate[];
  tenantId?: string;
}

@Injectable()
export class Nl2SqlService {
  private readonly logger = new Logger(Nl2SqlService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly erDiagram: ErDiagramService,
    private readonly sqlTool: SqlToolService,
    private readonly promptResolver: PromptResolverService,
  ) {}

  async generate(input: Nl2SqlGenerateInput): Promise<Nl2SqlGenerateResult> {
    try {
      await this.llm.assertConfigured();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw llmNotConfigured();
    }

    const published = await this.erDiagram.getPublished(input.connectorId);
    if (!published?.tables?.length) {
      throw new BadRequestException({
        code: 'ER_NOT_PUBLISHED',
        message:
          '连接器尚无已发布 ER 关系图，查询型 Runtime 不可用。请先在连接器详情中抽取表结构并发布关系图。',
      });
    }

    const clipped = this.clipErForSqlConfig(published, input.sqlConfig);
    const erContext = JSON.stringify(clipped, null, 2);
    const fewShot = this.buildFewShot(input.templates);
    const userVariables = buildNl2SqlUserVariables({
      erContext,
      tableBlacklist: input.sqlConfig.tableBlacklist ?? [],
      fieldBlacklist: input.sqlConfig.fieldBlacklist ?? [],
      maxRows: input.sqlConfig.maxRows,
      userMessage: input.userMessage,
      fewShot,
    });

    const [systemRendered, userRendered] = await Promise.all([
      this.promptResolver.render({
        promptKey: PROMPT_KEYS.QUERY_NL2SQL_SYSTEM,
        channel: 'published',
        tenantId: input.tenantId,
        variables: {},
      }),
      this.promptResolver.render({
        promptKey: PROMPT_KEYS.QUERY_NL2SQL_USER,
        channel: 'published',
        tenantId: input.tenantId,
        variables: userVariables,
      }),
    ]);

    let lastValidationError: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const messages =
        attempt === 0
          ? [
              { role: 'system' as const, content: systemRendered.content },
              { role: 'user' as const, content: userRendered.content },
            ]
          : [
              { role: 'system' as const, content: systemRendered.content },
              { role: 'user' as const, content: userRendered.content },
              {
                role: 'user' as const,
                content: `上次生成的 SQL 未通过校验：${lastValidationError}\n请修正后仍只输出 JSON。`,
              },
            ];

      const completion = await this.llm.chatCompletion(messages);
      const parsed = this.parseNl2SqlJson(completion.text);

      try {
        this.sqlTool.assertReadonlySql(parsed.sql, input.sqlConfig);
        this.assertTablesInEr(parsed, clipped, input.sqlConfig);
        return {
          sql: parsed.sql,
          explanation: parsed.explanation,
          referencedTables: parsed.referencedTables,
          params: parsed.params ?? {},
        };
      } catch (err) {
        lastValidationError = this.formatValidationError(err);
        if (attempt === 1) {
          throw new BadRequestException({
            code: 'NL2SQL_VALIDATION_FAILED',
            message: lastValidationError,
          });
        }
        this.logger.warn(`NL2SQL 校验失败，重试：${lastValidationError}`);
      }
    }

    throw new BadRequestException({
      code: 'NL2SQL_FAILED',
      message: 'NL2SQL 生成失败',
    });
  }

  /** 按黑名单裁剪 ER；历史表白名单配置时仅保留白名单内表（兼容旧数据）。 */
  clipErForSqlConfig(diagram: ErDiagram, sqlConfig: SqlToolConfig): ErDiagram {
    const legacy = sqlConfig as LegacySqlToolConfig;
    const tableBlacklist = new Set(
      (sqlConfig.tableBlacklist ?? []).map((t) => t.toLowerCase()),
    );
    const legacyWhitelist = (legacy.tableWhitelist ?? []).map((t) => t.toLowerCase());

    let tables: ErTableNode[] = diagram.tables ?? [];
    if (tableBlacklist.size > 0) {
      tables = tables.filter((t) => !tableBlacklist.has(t.name.toLowerCase()));
    } else if (legacyWhitelist.length > 0) {
      const allowed = new Set(legacyWhitelist);
      tables = tables.filter((t) => allowed.has(t.name.toLowerCase()));
    }

    const fieldBlacklist = sqlConfig.fieldBlacklist ?? [];
    const legacyFieldWhitelist = legacy.fieldWhitelist ?? [];
    if (fieldBlacklist.length > 0) {
      const blocked = new Set(fieldBlacklist.map((f) => f.toLowerCase()));
      tables = tables.map((t) => ({
        ...t,
        columns: (t.columns ?? []).filter(
          (c) =>
            !blocked.has(c.name.toLowerCase()) &&
            !blocked.has(`${t.name}.${c.name}`.toLowerCase()),
        ),
      }));
    } else if (legacyFieldWhitelist.length > 0) {
      const allowedFields = new Set(legacyFieldWhitelist.map((f) => f.toLowerCase()));
      tables = tables.map((t) => ({
        ...t,
        columns: (t.columns ?? []).filter((c) =>
          allowedFields.has(c.name.toLowerCase()),
        ),
      }));
    }

    const tableNames = new Set(tables.map((t) => t.name.toLowerCase()));
    const relationships = (diagram.relationships ?? []).filter(
      (r) =>
        tableNames.has(r.from.toLowerCase()) && tableNames.has(r.to.toLowerCase()),
    );

    return { ...diagram, tables, relationships };
  }

  private assertTablesInEr(
    parsed: Nl2SqlGenerateResult,
    clipped: ErDiagram,
    sqlConfig: SqlToolConfig,
  ): void {
    const legacy = sqlConfig as LegacySqlToolConfig;
    const erTables = new Set(clipped.tables.map((t) => t.name.toLowerCase()));
    const illegal = parsed.referencedTables.filter(
      (t) => !erTables.has(t.toLowerCase()),
    );
    if (illegal.length > 0) {
      throw new BadRequestException({
        code: 'NL2SQL_TABLE_NOT_IN_ER',
        message: `SQL 引用了关系图外的表：${illegal.join(', ')}`,
      });
    }

    const blacklist = (sqlConfig.tableBlacklist ?? []).map((t) => t.toLowerCase());
    if (blacklist.length > 0) {
      const blocked = parsed.referencedTables.filter((t) =>
        blacklist.includes(t.toLowerCase()),
      );
      if (blocked.length > 0) {
        throw new BadRequestException({
          code: 'SQL_TABLE_BLACKLISTED',
          message: `引用了黑名单中的表：${blocked.join(', ')}`,
        });
      }
      return;
    }

    const legacyWhitelist = (legacy.tableWhitelist ?? []).map((t) => t.toLowerCase());
    if (legacyWhitelist.length > 0) {
      const outside = parsed.referencedTables.filter(
        (t) => !legacyWhitelist.includes(t.toLowerCase()),
      );
      if (outside.length > 0) {
        throw new BadRequestException({
          code: 'SQL_TABLE_NOT_ALLOWED',
          message: `引用了白名单外的表：${outside.join(', ')}`,
        });
      }
    }
  }

  private parseNl2SqlJson(text: string): Nl2SqlGenerateResult {
    const trimmed = text.trim();
    const jsonStr = trimmed.startsWith('{')
      ? trimmed
      : trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? trimmed;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      throw new BadRequestException({
        code: 'NL2SQL_INVALID_JSON',
        message: 'LLM 返回的不是合法 JSON',
      });
    }
    const sql = typeof raw.sql === 'string' ? raw.sql.trim() : '';
    if (!sql) {
      throw new BadRequestException({
        code: 'NL2SQL_INVALID_SHAPE',
        message: 'LLM 输出缺少 sql 字段',
      });
    }
    const explanation =
      typeof raw.explanation === 'string' ? raw.explanation : '';
    const referencedTables = Array.isArray(raw.referencedTables)
      ? raw.referencedTables.filter((t): t is string => typeof t === 'string')
      : [];
    const params =
      raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params)
        ? (raw.params as Record<string, unknown>)
        : {};
    return { sql, explanation, referencedTables, params };
  }

  private buildFewShot(templates?: SqlTemplate[]): string | undefined {
    if (!templates?.length) return undefined;
    return templates
      .slice(0, 3)
      .map((t) => `- ${t.name}: ${t.sql}${t.description ? ` (${t.description})` : ''}`)
      .join('\n');
  }

  private formatValidationError(err: unknown): string {
    if (err instanceof BadRequestException) {
      const res = err.getResponse();
      if (typeof res === 'object' && res !== null && 'message' in res) {
        const msg = (res as { message?: string | string[] }).message;
        return Array.isArray(msg) ? msg.join('；') : String(msg);
      }
      return err.message;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
