import { IntrospectedSchema } from './connector-schema.types';

/** ER 生成专用：至少 8k，上限 16k（避免多表库输出被平台 max_tokens 截断） */
export const ER_DIAGRAM_MAX_TOKENS = 16_384;
export const ER_DIAGRAM_MIN_MAX_TOKENS = 8_192;

/** 发给 LLM 的精简 schema：含 FK/PK/列名，不含完整列类型与注释，降低输入与输出体积 */
export function buildCompactSchemaForErLlm(schema: IntrospectedSchema) {
  return {
    database: schema.database,
    tables: schema.tables.map((t) => ({
      name: t.name,
      comment: t.comment,
      primaryKey: t.primaryKey,
      foreignKeys: t.foreignKeys.map((fk) => ({
        column: fk.column,
        referencedTable: fk.referencedTable,
        referencedColumn: fk.referencedColumn,
      })),
      columns: t.columns.map((c) => c.name),
    })),
  };
}

/** 已有草稿的精简表示，供 LLM 在原有基础上优化 */
export function buildCompactDraftForErLlm(draft: {
  tables?: { name: string; displayName?: string }[];
  relationships?: {
    id: string;
    from: string;
    to: string;
    fromColumns: string[];
    toColumns: string[];
    cardinality: string;
    inferred: boolean;
  }[];
}) {
  return {
    tables: (draft.tables ?? []).map((t) => ({
      name: t.name,
      displayName: t.displayName,
    })),
    relationships: (draft.relationships ?? []).map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      fromColumns: r.fromColumns,
      toColumns: r.toColumns,
      cardinality: r.cardinality,
      inferred: r.inferred,
    })),
  };
}
