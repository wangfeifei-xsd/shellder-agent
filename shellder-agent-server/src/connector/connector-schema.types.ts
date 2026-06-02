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

export interface ErTableNode {
  name: string;
  displayName?: string;
  columns: ErColumn[];
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
