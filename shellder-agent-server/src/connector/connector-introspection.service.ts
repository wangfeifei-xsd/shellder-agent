import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { RowDataPacket } from 'mysql2';
import { PrismaService } from '../prisma/prisma.service';
import {
  IntrospectedColumn,
  IntrospectedForeignKey,
  IntrospectedIndex,
  IntrospectedSchema,
  IntrospectedTable,
} from './connector-schema.types';
import { openDbConnection, resolveDbConnectionParams } from './db-connection.util';

@Injectable()
export class ConnectorIntrospectionService {
  private readonly logger = new Logger(ConnectorIntrospectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 从 information_schema 抽取表结构并写入 connector_db_metadata */
  async introspect(connector: Connector): Promise<IntrospectedSchema> {
    if (connector.type !== 'db_readonly') {
      throw new BadRequestException({
        code: 'CONNECTOR_NOT_DB_READONLY',
        message: '仅只读数据库连接器支持结构抽取',
      });
    }

    const params = resolveDbConnectionParams(connector);
    const schema = await this.fetchSchema(params);
    const now = new Date();

    await this.prisma.connectorDbMetadata.upsert({
      where: { connectorId: connector.id },
      create: {
        connectorId: connector.id,
        introspectedSchema: schema as object,
        introspectedAt: now,
      },
      update: {
        introspectedSchema: schema as object,
        introspectedAt: now,
      },
    });

    this.logger.log(
      `连接器 ${connector.id} 结构抽取完成：${schema.tables.length} 张表`,
    );
    return schema;
  }

  async getSchema(connectorId: string): Promise<{
    introspectedSchema: IntrospectedSchema | null;
    introspectedAt: Date | null;
  }> {
    const row = await this.prisma.connectorDbMetadata.findUnique({
      where: { connectorId },
    });
    return {
      introspectedSchema: row?.introspectedSchema as IntrospectedSchema | null,
      introspectedAt: row?.introspectedAt ?? null,
    };
  }

  private async fetchSchema(
    params: ReturnType<typeof resolveDbConnectionParams>,
  ): Promise<IntrospectedSchema> {
    const conn = await openDbConnection(params);
    const db = params.database;
    try {
      const [tableRows] = await conn.query<RowDataPacket[]>(
        `SELECT TABLE_NAME AS name, TABLE_COMMENT AS comment
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [db],
      );

      const [columnRows] = await conn.query<RowDataPacket[]>(
        `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, DATA_TYPE AS dataType,
                COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable,
                COLUMN_DEFAULT AS defaultValue, COLUMN_COMMENT AS comment,
                ORDINAL_POSITION AS ordinalPosition
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [db],
      );

      const [pkRows] = await conn.query<RowDataPacket[]>(
        `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [db],
      );

      const [fkRows] = await conn.query<RowDataPacket[]>(
        `SELECT CONSTRAINT_NAME AS name, TABLE_NAME AS tableName,
                COLUMN_NAME AS columnName, REFERENCED_TABLE_NAME AS referencedTable,
                REFERENCED_COLUMN_NAME AS referencedColumn
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [db],
      );

      const [indexRows] = await conn.query<RowDataPacket[]>(
        `SELECT TABLE_NAME AS tableName, INDEX_NAME AS name, NON_UNIQUE AS nonUnique,
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND INDEX_NAME != 'PRIMARY'
         GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
         ORDER BY TABLE_NAME, INDEX_NAME`,
        [db],
      );

      const columnsByTable = groupBy(columnRows, 'tableName');
      const pkByTable = groupMulti(pkRows, 'tableName', 'columnName');
      const fkByTable = groupFk(fkRows);
      const indexByTable = groupIndex(indexRows);

      const tables: IntrospectedTable[] = tableRows.map((t) => {
        const tableName = String(t.name);
        return {
          name: tableName,
          comment: t.comment ? String(t.comment) : null,
          columns: (columnsByTable.get(tableName) ?? []).map(
            (c): IntrospectedColumn => ({
              name: String(c.name),
              dataType: String(c.dataType),
              columnType: String(c.columnType),
              nullable: c.nullable === 'YES',
              defaultValue: c.defaultValue != null ? String(c.defaultValue) : null,
              comment: c.comment ? String(c.comment) : null,
              ordinalPosition: Number(c.ordinalPosition),
            }),
          ),
          primaryKey: pkByTable.get(tableName) ?? [],
          foreignKeys: fkByTable.get(tableName) ?? [],
          indexes: indexByTable.get(tableName) ?? [],
        };
      });

      return {
        database: db,
        tables,
        extractedAt: new Date().toISOString(),
      };
    } finally {
      await conn.end().catch(() => undefined);
    }
  }
}

function groupBy(rows: RowDataPacket[], key: string): Map<string, RowDataPacket[]> {
  const map = new Map<string, RowDataPacket[]>();
  for (const row of rows) {
    const k = String(row[key]);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

function groupMulti(
  rows: RowDataPacket[],
  key: string,
  valueKey: string,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const k = String(row[key]);
    const list = map.get(k) ?? [];
    list.push(String(row[valueKey]));
    map.set(k, list);
  }
  return map;
}

function groupFk(rows: RowDataPacket[]): Map<string, IntrospectedForeignKey[]> {
  const map = new Map<string, IntrospectedForeignKey[]>();
  for (const row of rows) {
    const k = String(row.tableName);
    const list = map.get(k) ?? [];
    list.push({
      name: String(row.name),
      column: String(row.columnName),
      referencedTable: String(row.referencedTable),
      referencedColumn: String(row.referencedColumn),
    });
    map.set(k, list);
  }
  return map;
}

function groupIndex(rows: RowDataPacket[]): Map<string, IntrospectedIndex[]> {
  const map = new Map<string, IntrospectedIndex[]>();
  for (const row of rows) {
    const k = String(row.tableName);
    const list = map.get(k) ?? [];
    list.push({
      name: String(row.name),
      unique: Number(row.nonUnique) === 0,
      columns: String(row.columns ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    });
    map.set(k, list);
  }
  return map;
}
