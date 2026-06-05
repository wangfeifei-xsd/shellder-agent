/** information_schema 确定性抽取结果 */
export interface IntrospectedSchema {
  database: string;
  tables: IntrospectedTable[];
  extractedAt: string;
}

export interface IntrospectedTable {
  name: string;
  comment: string | null;
  columns: IntrospectedColumn[];
  primaryKey: string[];
  foreignKeys: IntrospectedForeignKey[];
  indexes: IntrospectedIndex[];
}

export interface IntrospectedColumn {
  name: string;
  dataType: string;
  columnType: string;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
  ordinalPosition: number;
}

export interface IntrospectedForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface IntrospectedIndex {
  name: string;
  unique: boolean;
  columns: string[];
}

/** ER 关系图 JSON（§4.3） */
export interface ErDiagram {
  version?: number;
  tables: ErTableNode[];
  relationships: ErRelationship[];
}

/** 单表数据范围绑定（发布前须管理员确认） */
export interface ErDataScopeBinding {
  /** 范围字段，对应 scopeList，如 dept_id / org_id */
  scopeColumn?: string;
  /** 用户字段，对应 externalUserId，如 owner_user_id / created_by */
  userColumn?: string;
  /** 已加入范围列维护列表（可与 user 维度独立） */
  scopeConfigured?: boolean;
  /** 已加入用户列维护列表 */
  userConfigured?: boolean;
  /** 范围列映射已人工确认（LLM 推断后点确认） */
  scopeConfirmed?: boolean;
  /** 用户列映射已人工确认 */
  userConfirmed?: boolean;
  /** LLM 建议未人工确认时为 true */
  inferred?: boolean;
  /** LLM 建议理由（可选，便于确认面板展示） */
  reason?: string;
}

export interface ErTableNode {
  name: string;
  displayName?: string;
  columns: ErColumn[];
  dataScope?: ErDataScopeBinding;
}

export interface ErColumn {
  name: string;
  type: string;
  pk?: boolean;
  fk?: { table: string; column: string };
}

export interface ErRelationship {
  id: string;
  from: string;
  to: string;
  fromColumns: string[];
  toColumns: string[];
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:M';
  inferred: boolean;
}
