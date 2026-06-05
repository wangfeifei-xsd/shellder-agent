import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { PromptResolverService } from '../prompt/prompt-resolver.service';
import { PROMPT_KEYS } from '../prompt/prompt-keys';
import { ConnectorIntrospectionService } from './connector-introspection.service';
import { ErDiagramService } from './er-diagram.service';
import {
  ErDataScopeBinding,
  ErDiagram,
  ErTableNode,
  IntrospectedSchema,
} from './connector-schema.types';
import { buildCompactSchemaForErLlm } from './er-diagram.prompt';
import { buildErDataScopeUserMessageBody } from './er-data-scope.variables';
import {
  excerptLlmText,
  parseLlmJsonText,
  salvageDataScopeTables,
} from './llm-response-json.util';

/** 多表分析时预留足够输出 token，降低截断概率 */
const ER_DATA_SCOPE_MIN_MAX_TOKENS = 8192;

interface ErDataScopeLlmTable {
  name: string;
  dataScope?: ErDataScopeBinding;
}

interface ErDataScopeLlmPayload {
  tables?: ErDataScopeLlmTable[];
}

@Injectable()
export class ErDataScopeService {
  private readonly logger = new Logger(ErDataScopeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly introspection: ConnectorIntrospectionService,
    private readonly erDiagram: ErDiagramService,
    private readonly promptResolver: PromptResolverService,
  ) {}

  async suggestDataScope(
    connector: Connector,
  ): Promise<{ diagram: ErDiagram; warnings: string[] }> {
    const { introspectedSchema } = await this.introspection.getSchema(connector.id);
    if (!introspectedSchema?.tables?.length) {
      throw new BadRequestException({
        code: 'SCHEMA_NOT_INTROSPECTED',
        message: '请先执行表结构抽取',
      });
    }

    const meta = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId: connector.id },
    });
    const existingDraft = (meta?.erDiagramDraft as ErDiagram | null) ?? null;
    const targetTables = this.resolveTargetTables(existingDraft, introspectedSchema);
    const tableNames = targetTables.map((t) => t.name);

    const config = await this.llm.assertConfigured();
    const compactSchema = buildCompactSchemaForErLlm(introspectedSchema);
    const userMessageBody = buildErDataScopeUserMessageBody(
      JSON.stringify(compactSchema),
      JSON.stringify(tableNames),
    );

    const [systemRendered, userRendered] = await Promise.all([
      this.promptResolver.render({
        promptKey: PROMPT_KEYS.CONNECTOR_ER_DATA_SCOPE_SYSTEM,
        channel: 'published',
        tenantId: connector.tenantId,
        variables: {},
      }),
      this.promptResolver.render({
        promptKey: PROMPT_KEYS.CONNECTOR_ER_DATA_SCOPE_USER,
        channel: 'published',
        tenantId: connector.tenantId,
        variables: { userMessageBody },
      }),
    ]);

    const messages = [
      { role: 'system' as const, content: systemRendered.content },
      { role: 'user' as const, content: userRendered.content },
    ];
    const maxTokens = Math.max(ER_DATA_SCOPE_MIN_MAX_TOKENS, config.maxTokens);
    this.logger.log(
      `连接器 ${connector.id} 开始 LLM 分析限制字段（${tableNames.length} 张表，max_tokens=${maxTokens}）`,
    );

    let lastRawText = '';
    let payload: ErDataScopeLlmPayload | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await this.llm.chatCompletion(config, messages, { maxTokens });
      lastRawText = result.text;
      this.logger.log(
        `连接器 ${connector.id} 限制字段 LLM 第 ${attempt} 次返回 model=${result.model} ` +
          `elapsed=${result.elapsedMs}ms len=${result.text.length}`,
      );
      payload = this.parseDataScopeJson(result.text, connector.id, tableNames);
      if (payload) break;
      if (attempt < 2) {
        this.logger.warn(`连接器 ${connector.id} 限制字段 JSON 解析失败，将重试 LLM`);
      }
    }
    if (!payload) {
      this.throwInvalidDataScopeJson(connector.id, lastRawText, '重试后仍无法解析');
    }
    let diagram = this.mergeDataScopeIntoDraft(
      targetTables,
      existingDraft,
      introspectedSchema,
      payload,
    );
    this.erDiagram.validateTablesInSchema(diagram, introspectedSchema, connector.id);
    const sanitized = this.erDiagram.sanitizeDataScopeColumns(
      diagram,
      introspectedSchema,
    );
    diagram = sanitized.diagram;
    const warnings: string[] = [];
    if (sanitized.dropped.length > 0) {
      const msg =
        `以下限制字段列名不在对应表结构中，已自动忽略：${sanitized.dropped.join('；')}`;
      warnings.push(msg);
      this.logger.warn(`连接器 ${connector.id} ${msg}`);
    }

    await this.prisma.connectorDbMetadata.upsert({
      where: { connectorId: connector.id },
      create: {
        connectorId: connector.id,
        erDiagramDraft: diagram as object,
      },
      update: {
        erDiagramDraft: diagram as object,
      },
    });

    this.logger.log(
      `连接器 ${connector.id} 限制字段建议已合并进 ER 草稿（${diagram.tables.length} 张表）`,
    );
    return { diagram, warnings };
  }

  private resolveTargetTables(
    draft: ErDiagram | null,
    schema: IntrospectedSchema,
  ): ErTableNode[] {
    if (draft?.tables?.length) {
      return draft.tables;
    }
    return schema.tables.map((t) => ({
      name: t.name,
      columns: [],
    }));
  }

  private mergeDataScopeIntoDraft(
    targetTables: ErTableNode[],
    existingDraft: ErDiagram | null,
    schema: IntrospectedSchema,
    payload: ErDataScopeLlmPayload,
  ): ErDiagram {
    const suggestions = new Map(
      (payload.tables ?? []).map((t) => [t.name.toLowerCase(), t.dataScope]),
    );

    const baseDiagram =
      existingDraft?.tables?.length && existingDraft.tables[0].columns?.length
        ? existingDraft
        : this.erDiagram.mergeDiagramWithSchema(
            { tables: targetTables.map((t) => ({ name: t.name })), relationships: existingDraft?.relationships ?? [] },
            schema,
            existingDraft,
          );

    const tables = (baseDiagram.tables ?? []).map((table) => {
      const suggested = suggestions.get(table.name.toLowerCase());
      if (!suggested) {
        return table;
      }
      const prev = table.dataScope;
      if (prev && prev.inferred === false) {
        return table;
      }
      const scopeColumn = suggested.scopeColumn?.trim() || undefined;
      const userColumn = suggested.userColumn?.trim() || undefined;
      const next: ErDataScopeBinding = {
        ...prev,
        scopeColumn: scopeColumn ?? prev?.scopeColumn,
        userColumn: userColumn ?? prev?.userColumn,
        reason: suggested.reason?.trim() || prev?.reason,
        inferred: true,
        scopeConfirmed: scopeColumn ? false : prev?.scopeConfirmed,
        userConfirmed: userColumn ? false : prev?.userConfirmed,
        scopeConfigured:
          !!scopeColumn || prev?.scopeConfigured === true || !!prev?.scopeColumn,
        userConfigured:
          !!userColumn || prev?.userConfigured === true || !!prev?.userColumn,
      };
      const hasBinding =
        !!next.scopeColumn ||
        !!next.userColumn ||
        next.scopeConfigured === true ||
        next.userConfigured === true;
      if (!hasBinding) {
        return { ...table, dataScope: undefined };
      }
      return { ...table, dataScope: next };
    });

    return {
      version: baseDiagram.version,
      tables,
      relationships: baseDiagram.relationships ?? [],
    };
  }

  private parseDataScopeJson(
    text: string,
    connectorId: string,
    knownTableNames: string[],
  ): ErDataScopeLlmPayload | null {
    const parsed = parseLlmJsonText(text);
    if (parsed.ok) {
      const payload = parsed.value as ErDataScopeLlmPayload;
      if (!Array.isArray(payload.tables)) {
        this.logger.warn(`连接器 ${connectorId} 限制字段 JSON 缺少 tables`);
        throw new BadRequestException({
          code: 'ER_DATA_SCOPE_INVALID_SHAPE',
          message: '限制字段 JSON 缺少 tables 数组',
          details: { preview: excerptLlmText(text) },
        });
      }
      return payload;
    }

    const salvaged = salvageDataScopeTables(text, knownTableNames);
    if (salvaged.length > 0) {
      this.logger.warn(
        `连接器 ${connectorId} 限制字段 JSON 全量解析失败（${parsed.parseError}），` +
          `已 salvage ${salvaged.length}/${knownTableNames.length} 张表`,
      );
      return { tables: salvaged };
    }

    const preview = excerptLlmText(text);
    this.logger.warn(
      `连接器 ${connectorId} 限制字段 JSON 解析失败：${parsed.parseError}；` +
        `likelyTruncated=${parsed.likelyTruncated} rawLen=${text.length} ` +
        `jsonLen=${parsed.jsonStr.length} preview=${preview}`,
    );
    return null;
  }

  private throwInvalidDataScopeJson(
    connectorId: string,
    text: string,
    reason: string,
  ): never {
    const parsed = parseLlmJsonText(text);
    const preview = excerptLlmText(text);
    const parseError = parsed.ok ? reason : parsed.parseError;
    const likelyTruncated = parsed.ok ? false : parsed.likelyTruncated;
    this.logger.warn(
      `连接器 ${connectorId} 限制字段最终失败：${reason}；parseError=${parseError}`,
    );
    throw new BadRequestException({
      code: likelyTruncated ? 'ER_DATA_SCOPE_OUTPUT_TRUNCATED' : 'ER_DATA_SCOPE_INVALID_JSON',
      message: likelyTruncated
        ? '限制字段 LLM 输出被截断（多为 max_tokens 不足），请重试或提高系统设置中的 max_tokens'
        : `限制字段 LLM 返回不是合法 JSON（${parseError}）`,
      details: {
        parseError,
        responseLength: text.length,
        extractedJsonLength: parsed.ok ? 0 : parsed.jsonStr.length,
        likelyTruncated,
        preview,
      },
    });
  }
}
