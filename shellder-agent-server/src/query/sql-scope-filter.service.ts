import { BadRequestException, Injectable } from '@nestjs/common';
import { ResolvedDataScope, ResolvedTableScope } from './data-scope-resolve.service';

export interface SqlScopeFilterResult {
  sql: string;
  params: Record<string, unknown>;
  appliedScopeFilters: string[];
}

@Injectable()
export class SqlScopeFilterService {
  apply(
    sql: string,
    referencedTables: string[],
    resolved: ResolvedDataScope,
    existingParams: Record<string, unknown>,
  ): SqlScopeFilterResult {
    if (
      !resolved.scopeDimensionActive &&
      !resolved.userDimensionActive
    ) {
      return { sql, params: { ...existingParams }, appliedScopeFilters: [] };
    }

    const refSet = new Set(referencedTables.map((t) => t.toLowerCase()));
    const conditions: string[] = [];
    const params: Record<string, unknown> = { ...existingParams };
    const appliedScopeFilters: string[] = [];

    for (const tableName of referencedTables) {
      const key = tableName.toLowerCase();
      if (!refSet.has(key)) continue;

      const binding = resolved.bindingsByTable.get(key);
      const active = resolved.activeFilters.find(
        (f) => f.tableName.toLowerCase() === key,
      );

      if (resolved.scopeDimensionActive) {
        if (!binding?.scopeColumn) {
          throw new BadRequestException({
            code: 'DATA_SCOPE_BINDING_MISSING',
            message: `表「${tableName}」缺少范围字段绑定，无法按 scopeList 过滤`,
            details: { table: tableName, dimension: 'scope' },
          });
        }
      }

      if (resolved.userDimensionActive) {
        if (!binding?.userColumn) {
          throw new BadRequestException({
            code: 'DATA_SCOPE_BINDING_MISSING',
            message: `表「${tableName}」缺少用户字段绑定，无法按 externalUserId 过滤`,
            details: { table: tableName, dimension: 'user' },
          });
        }
      }

      if (!active) continue;

      this.assertNoScopeConflict(sql, active, referencedTables);

      const tableRef = this.quoteIdent(tableName);

      if (active.scopeColumn && active.scopeValues?.length) {
        const placeholders: string[] = [];
        active.scopeValues.forEach((val, idx) => {
          const p = `ds_scope_${key}_${idx}`;
          params[p] = val;
          placeholders.push(`:${p}`);
        });
        const colRef = `${tableRef}.${this.quoteIdent(active.scopeColumn)}`;
        conditions.push(`${colRef} IN (${placeholders.join(', ')})`);
        appliedScopeFilters.push(
          `${tableName}.${active.scopeColumn} IN (${active.scopeValues.length}项)`,
        );
      }

      if (active.userColumn && active.userValue) {
        const p = `ds_user_${key}`;
        params[p] = active.userValue;
        const colRef = `${tableRef}.${this.quoteIdent(active.userColumn)}`;
        conditions.push(`${colRef} = :${p}`);
        appliedScopeFilters.push(
          `${tableName}.${active.userColumn} = :${p}`,
        );
      }
    }

    if (conditions.length === 0) {
      return { sql, params, appliedScopeFilters: [] };
    }

    const injected = this.injectAndConditions(sql, conditions);
    return {
      sql: injected,
      params,
      appliedScopeFilters,
    };
  }

  private assertNoScopeConflict(
    sql: string,
    active: ResolvedTableScope,
    referencedTables: string[],
  ): void {
    const lower = sql.toLowerCase();
    const whereIdx = lower.search(/\bwhere\b/);
    if (whereIdx < 0) return;
    const afterWhere = lower.slice(whereIdx);

    if (
      active.scopeColumn &&
      this.columnConflictsInWhere(
        sql,
        afterWhere,
        active.tableName,
        active.scopeColumn,
        referencedTables,
      )
    ) {
      throw new BadRequestException({
        code: 'DATA_SCOPE_SQL_CONFLICT',
        message: `SQL 已包含表「${active.tableName}」的范围字段「${active.scopeColumn}」条件，与强制数据范围冲突，请移除该条件后重试`,
        details: { table: active.tableName, column: active.scopeColumn },
      });
    }
    if (
      active.userColumn &&
      this.columnConflictsInWhere(
        sql,
        afterWhere,
        active.tableName,
        active.userColumn,
        referencedTables,
      )
    ) {
      throw new BadRequestException({
        code: 'DATA_SCOPE_SQL_CONFLICT',
        message: `SQL 已包含表「${active.tableName}」的用户字段「${active.userColumn}」条件，与强制数据范围冲突，请移除该条件后重试`,
        details: { table: active.tableName, column: active.userColumn },
      });
    }
  }

  /**
   * 仅当 WHERE 中已出现「本表」上的该列时才视为冲突。
   * 避免将其它表的 `id` 等短列名误判为本表范围/用户列。
   */
  private columnConflictsInWhere(
    fullSql: string,
    afterWhereSql: string,
    tableName: string,
    column: string,
    referencedTables: string[],
  ): boolean {
    const col = this.escapeRegex(column);
    const table = this.escapeRegex(tableName);

    const qualified = [
      new RegExp(`\\b${table}\\s*\\.\\s*${col}\\b`, 'i'),
      new RegExp(`\`${table}\`\\s*\\.\\s*\`${col}\``, 'i'),
    ];
    if (qualified.some((re) => re.test(afterWhereSql))) {
      return true;
    }

    for (const alias of this.extractTableAliases(fullSql, tableName)) {
      const al = this.escapeRegex(alias);
      const aliasPatterns = [
        new RegExp(`\\b${al}\\s*\\.\\s*${col}\\b`, 'i'),
        new RegExp(`\`${al}\`\\s*\\.\\s*\`${col}\``, 'i'),
      ];
      if (aliasPatterns.some((re) => re.test(afterWhereSql))) {
        return true;
      }
    }

    const distinctTables = new Set(referencedTables.map((t) => t.toLowerCase()));
    if (distinctTables.size === 1 && distinctTables.has(tableName.toLowerCase())) {
      return new RegExp(`\\b${col}\\b`, 'i').test(afterWhereSql);
    }
    return false;
  }

  private extractTableAliases(sql: string, tableName: string): string[] {
    const aliases = new Set<string>();
    const escapedTable = this.escapeRegex(tableName);
    const re = new RegExp(
      `(?:\\bfrom|\\bjoin)\\s+(?:\`${escapedTable}\`|${escapedTable})(?:\\s+as)?\\s+(\`[a-zA-Z_][a-zA-Z0-9_]*\`|[a-zA-Z_][a-zA-Z0-9_]*)`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const alias = m[1].replace(/`/g, '');
      if (alias.toLowerCase() !== tableName.toLowerCase()) {
        aliases.add(alias);
      }
    }
    return [...aliases];
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private injectAndConditions(sql: string, conditions: string[]): string {
    const clause = conditions.join(' AND ');
    if (/\bwhere\b/i.test(sql)) {
      return sql.replace(/\bwhere\b/i, `WHERE (${clause}) AND`);
    }
    const tail = sql.match(/\b(group\s+by|order\s+by|limit)\b/i);
    if (tail?.index !== undefined) {
      return (
        sql.slice(0, tail.index).trimEnd() +
        ` WHERE ${clause} ` +
        sql.slice(tail.index)
      );
    }
    return `${sql.trimEnd()} WHERE ${clause}`;
  }

  private quoteIdent(name: string): string {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return `\`${name}\``;
    }
    return `\`${name.replace(/`/g, '``')}\``;
  }
}
