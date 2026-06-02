import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { ConnectorIntrospectionService } from './connector-introspection.service';
import {
  ErColumn,
  ErDiagram,
  ErRelationship,
  IntrospectedSchema,
  IntrospectedTable,
} from './connector-schema.types';
import { PROMPT_KEYS } from '../prompt/prompt-keys';
import { PromptResolverService } from '../prompt/prompt-resolver.service';
import {
  buildErInitialUserMessageBody,
  buildErRefineUserMessageBody,
} from './er-diagram.variables';
import {
  buildCompactDraftForErLlm,
  buildCompactSchemaForErLlm,
  ER_DIAGRAM_MAX_TOKENS,
  ER_DIAGRAM_MIN_MAX_TOKENS,
} from './er-diagram.prompt';

/** LLM 仅返回表显示名与关系；列由 merge 补全 */
interface ErDiagramLlmPayload {
  tables?: { name: string; displayName?: string }[];
  relationships?: ErRelationship[];
}

/** 写入日志 / error.details 的 LLM 原文最大长度 */
const LLM_RESPONSE_LOG_MAX = 4000;

@Injectable()
export class ErDiagramService {
  private readonly logger = new Logger(ErDiagramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly introspection: ConnectorIntrospectionService,
    private readonly promptResolver: PromptResolverService,
  ) {}

  async getDiagramState(connectorId: string) {
    const row = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId },
    });
    return {
      introspectedAt: row?.introspectedAt ?? null,
      draft: (row?.erDiagramDraft as ErDiagram | null) ?? null,
      published: (row?.erDiagramPublished as ErDiagram | null) ?? null,
      publishedVersion: row?.erPublishedVersion ?? null,
      publishedAt: row?.erPublishedAt ?? null,
    };
  }

  async getPublished(connectorId: string): Promise<ErDiagram | null> {
    const row = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId },
      select: { erDiagramPublished: true },
    });
    return (row?.erDiagramPublished as ErDiagram | null) ?? null;
  }

  async regenerateDraft(connector: Connector): Promise<ErDiagram> {
    const config = await this.llm.assertConfigured();
    const { introspectedSchema } = await this.introspection.getSchema(connector.id);
    if (!introspectedSchema?.tables?.length) {
      throw new BadRequestException({
        code: 'SCHEMA_NOT_INTROSPECTED',
        message: '请先执行表结构抽取',
      });
    }

    const meta = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId: connector.id },
      select: { erDiagramDraft: true },
    });
    const existingDraft = (meta?.erDiagramDraft as ErDiagram | null) ?? null;
    const hasExistingDraft =
      !!existingDraft?.tables?.length || !!existingDraft?.relationships?.length;

    const tableCount = introspectedSchema.tables.length;
    const compactSchema = buildCompactSchemaForErLlm(introspectedSchema);
    const maxTokens = Math.min(
      ER_DIAGRAM_MAX_TOKENS,
      Math.max(ER_DIAGRAM_MIN_MAX_TOKENS, config.maxTokens),
    );
    this.logger.log(
      `连接器 ${connector.id} 开始 LLM 辅助生成 ER 草稿（${tableCount} 张表，` +
        `${hasExistingDraft ? '在已有草稿上优化' : '首次生成'}，max_tokens=${maxTokens}）`,
    );

    const schemaJson = JSON.stringify(compactSchema);
    const userMessageBody = hasExistingDraft
      ? buildErRefineUserMessageBody(
          schemaJson,
          JSON.stringify(buildCompactDraftForErLlm(existingDraft!)),
        )
      : buildErInitialUserMessageBody(schemaJson);

    const systemKey = hasExistingDraft
      ? PROMPT_KEYS.CONNECTOR_ER_DIAGRAM_REFINE_SYSTEM
      : PROMPT_KEYS.CONNECTOR_ER_DIAGRAM_SYSTEM;

    const [systemRendered, userRendered] = await Promise.all([
      this.promptResolver.render({
        promptKey: systemKey,
        channel: 'published',
        tenantId: connector.tenantId,
        variables: {},
      }),
      this.promptResolver.render({
        promptKey: PROMPT_KEYS.CONNECTOR_ER_DIAGRAM_USER,
        channel: 'published',
        tenantId: connector.tenantId,
        variables: { userMessageBody },
      }),
    ]);

    const result = await this.llm.chatCompletion(
      config,
      [
        { role: 'system', content: systemRendered.content },
        { role: 'user', content: userRendered.content },
      ],
      { maxTokens },
    );

    this.logger.log(
      `连接器 ${connector.id} LLM 返回 model=${result.model} elapsed=${result.elapsedMs}ms len=${result.text.length}`,
    );

    const payload = this.parseDiagramJson(result.text, connector.id);
    const diagram = this.mergeDiagramWithSchema(
      payload,
      introspectedSchema,
      existingDraft,
    );
    this.validateTablesInSchema(diagram, introspectedSchema, connector.id);

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
      `连接器 ${connector.id} ER 草稿已辅助生成` +
        (hasExistingDraft ? '（已合并保留确认状态）' : ''),
    );
    return diagram;
  }

  async saveDraft(connectorId: string, diagram: ErDiagram): Promise<ErDiagram> {
    const { introspectedSchema } = await this.introspection.getSchema(connectorId);
    if (!introspectedSchema) {
      throw new BadRequestException({
        code: 'SCHEMA_NOT_INTROSPECTED',
        message: '请先执行表结构抽取',
      });
    }
    this.validateTablesInSchema(diagram, introspectedSchema);

    const row = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'CONNECTOR_METADATA_NOT_FOUND',
        message: '连接器元数据不存在，请先抽取表结构',
      });
    }

    await this.prisma.connectorDbMetadata.update({
      where: { connectorId },
      data: { erDiagramDraft: diagram as object },
    });
    return diagram;
  }

  async publish(connectorId: string): Promise<{
    published: ErDiagram;
    version: number;
    publishedAt: Date;
  }> {
    const row = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId },
    });
    if (!row?.erDiagramDraft) {
      throw new BadRequestException({
        code: 'ER_DRAFT_EMPTY',
        message: '无 ER 草稿可发布，请先生成或保存草稿',
      });
    }

    const draft = row.erDiagramDraft as unknown as ErDiagram;
    const { introspectedSchema } = await this.introspection.getSchema(connectorId);
    if (introspectedSchema) {
      this.validateTablesInSchema(draft, introspectedSchema);
    }

    const version = (row.erPublishedVersion ?? 0) + 1;
    const publishedAt = new Date();
    const published: ErDiagram = { ...draft, version };

    await this.prisma.connectorDbMetadata.update({
      where: { connectorId },
      data: {
        erDiagramPublished: published as object,
        erPublishedVersion: version,
        erPublishedAt: publishedAt,
      },
    });

    return { published, version, publishedAt };
  }

  validateTablesInSchema(
    diagram: ErDiagram,
    schema: IntrospectedSchema,
    connectorId?: string,
  ): void {
    const allowed = new Set(schema.tables.map((t) => t.name.toLowerCase()));
    const illegal = (diagram.tables ?? [])
      .map((t) => t.name)
      .filter((name) => !allowed.has(name.toLowerCase()));
    if (illegal.length > 0) {
      if (connectorId) {
        this.logger.warn(
          `连接器 ${connectorId} ER 校验失败：未抽取的表 ${illegal.join(', ')}`,
        );
      }
      throw new BadRequestException({
        code: 'ER_TABLE_NOT_IN_SCHEMA',
        message: `关系图中存在未抽取的物理表：${illegal.join(', ')}`,
        details: { illegalTables: illegal },
      });
    }
  }

  mergeDiagramWithSchema(
    payload: ErDiagramLlmPayload,
    schema: IntrospectedSchema,
    existingDraft?: ErDiagram | null,
  ): ErDiagram {
    const llmDisplayByName = new Map(
      (payload.tables ?? []).map((t) => [
        t.name.toLowerCase(),
        t.displayName?.trim() || undefined,
      ]),
    );
    const existingDisplayByName = new Map(
      (existingDraft?.tables ?? []).map((t) => [
        t.name.toLowerCase(),
        t.displayName?.trim() || undefined,
      ]),
    );
    const tables = schema.tables.map((t) => {
      const key = t.name.toLowerCase();
      const llmDisplay = llmDisplayByName.get(key);
      const existingDisplay = existingDisplayByName.get(key);
      return {
        name: t.name,
        displayName: this.resolveDisplayName(
          t.name,
          t.comment,
          existingDisplay,
          llmDisplay,
        ),
        columns: this.columnsFromIntrospected(t),
      };
    });
    return {
      version: existingDraft?.version,
      tables,
      relationships: this.mergeRelationships(
        payload.relationships ?? [],
        existingDraft?.relationships ?? [],
      ),
    };
  }

  /** 结构完全一致时保留已有关系（含 inferred=false 确认状态与 id） */
  mergeRelationships(
    llmRelationships: ErRelationship[],
    existingRelationships: ErRelationship[],
  ): ErRelationship[] {
    const existingByKey = new Map(
      existingRelationships.map((r) => [this.relationshipStructureKey(r), r]),
    );
    const merged: ErRelationship[] = [];
    const consumedKeys = new Set<string>();

    for (const llm of llmRelationships) {
      const key = this.relationshipStructureKey(llm);
      const prev = existingByKey.get(key);
      if (prev && this.relationshipsStructurallyEqual(llm, prev)) {
        merged.push(prev);
        consumedKeys.add(key);
        continue;
      }
      if (prev && prev.inferred === false) {
        merged.push({
          ...llm,
          id: prev.id,
          inferred: false,
        });
        consumedKeys.add(key);
        continue;
      }
      merged.push(llm);
      consumedKeys.add(key);
    }

    for (const prev of existingRelationships) {
      const key = this.relationshipStructureKey(prev);
      if (!consumedKeys.has(key)) {
        merged.push(prev);
      }
    }

    return merged;
  }

  private resolveDisplayName(
    tableName: string,
    schemaComment: string | null,
    existingDisplay?: string,
    llmDisplay?: string,
  ): string {
    const ex = existingDisplay?.trim();
    const llm = llmDisplay?.trim();
    if (ex && ex !== tableName) {
      if (!llm || llm === ex) return ex;
      return ex;
    }
    if (llm) return llm;
    if (ex) return ex;
    if (schemaComment?.trim()) return schemaComment.trim();
    return tableName;
  }

  private normalizeColumns(cols: string[]): string[] {
    return [...cols].map((c) => c.toLowerCase()).sort();
  }

  private relationshipStructureKey(r: ErRelationship): string {
    return [
      r.from.toLowerCase(),
      r.to.toLowerCase(),
      r.cardinality,
      this.normalizeColumns(r.fromColumns ?? []).join(','),
      this.normalizeColumns(r.toColumns ?? []).join(','),
    ].join('|');
  }

  private relationshipsStructurallyEqual(
    a: ErRelationship,
    b: ErRelationship,
  ): boolean {
    return this.relationshipStructureKey(a) === this.relationshipStructureKey(b);
  }

  private columnsFromIntrospected(table: IntrospectedTable): ErColumn[] {
    const pkSet = new Set(table.primaryKey.map((p) => p.toLowerCase()));
    const fkByCol = new Map(
      table.foreignKeys.map((fk) => [fk.column.toLowerCase(), fk]),
    );
    return table.columns.map((c) => {
      const fk = fkByCol.get(c.name.toLowerCase());
      return {
        name: c.name,
        type: c.dataType,
        pk: pkSet.has(c.name.toLowerCase()),
        ...(fk
          ? { fk: { table: fk.referencedTable, column: fk.referencedColumn } }
          : {}),
      };
    });
  }

  private excerpt(text: string, max = LLM_RESPONSE_LOG_MAX): string {
    const t = text.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…（共 ${t.length} 字符，已截断）`;
  }

  private parseDiagramJson(text: string, connectorId: string): ErDiagramLlmPayload {
    const trimmed = text.trim();
    const jsonStr = trimmed.startsWith('{')
      ? trimmed
      : trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? trimmed;
    let parsed: unknown;
    let parseError: string | undefined;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
      const preview = this.excerpt(text);
      const likelyTruncated =
        /unterminated string|unexpected end of json/i.test(parseError) ||
        (!jsonStr.trimEnd().endsWith('}') && jsonStr.includes('"tables"'));
      this.logger.warn(
        `连接器 ${connectorId} ER JSON 解析失败：${parseError}；` +
          `rawLen=${text.length} jsonLen=${jsonStr.length} likelyTruncated=${likelyTruncated}；` +
          `rawPreview=${preview}`,
      );
      throw new BadRequestException({
        code: likelyTruncated ? 'ER_LLM_OUTPUT_TRUNCATED' : 'ER_LLM_INVALID_JSON',
        message: likelyTruncated
          ? 'LLM 输出被截断（多为 max_tokens 不足），请重试；若仍失败可在系统设置提高 max_tokens'
          : `LLM 返回的 ER 图不是合法 JSON（${parseError}）`,
        details: {
          parseError,
          responseLength: text.length,
          extractedJsonLength: jsonStr.length,
          likelyTruncated,
          preview,
        },
      });
    }
    const diagram = parsed as ErDiagramLlmPayload;
    if (!Array.isArray(diagram.tables)) {
      const preview = this.excerpt(text);
      this.logger.warn(
        `连接器 ${connectorId} ER JSON 结构无效：缺少 tables；preview=${preview}`,
      );
      throw new BadRequestException({
        code: 'ER_LLM_INVALID_SHAPE',
        message: 'ER 图 JSON 缺少 tables 数组',
        details: { preview },
      });
    }
    if (!Array.isArray(diagram.relationships)) {
      diagram.relationships = [];
    }
    return diagram;
  }
}
