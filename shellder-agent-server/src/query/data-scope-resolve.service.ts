import { Injectable } from '@nestjs/common';
import { PrincipalContext } from '../agent-runtime/agent-runtime.types';
import { ErDiagram } from '../connector/connector-schema.types';

export interface ResolvedTableScope {
  tableName: string;
  scopeColumn?: string;
  scopeValues?: string[];
  userColumn?: string;
  userValue?: string;
}

export interface ResolvedDataScope {
  scopeContextText: string;
  scopeDimensionActive: boolean;
  userDimensionActive: boolean;
  /** 已发布 ER 各表绑定（小写表名 → 列配置） */
  bindingsByTable: Map<
    string,
    { scopeColumn?: string; userColumn?: string }
  >;
  /** 入参 + 绑定均满足时可注入过滤的表 */
  activeFilters: ResolvedTableScope[];
}

@Injectable()
export class DataScopeResolveService {
  resolve(
    principal: PrincipalContext | undefined,
    publishedEr: ErDiagram,
  ): ResolvedDataScope {
    const scopeValues =
      principal?.scopeList?.filter((s) => typeof s === 'string' && s.trim()) ??
      [];
    const scopeDimensionActive = scopeValues.length > 0;
    const userValue = principal?.externalUserId?.trim();
    const userDimensionActive = !!userValue;

    const bindingsByTable = new Map<
      string,
      { scopeColumn?: string; userColumn?: string }
    >();
    for (const table of publishedEr.tables ?? []) {
      const ds = table.dataScope;
      if (!ds?.scopeColumn && !ds?.userColumn) continue;
      bindingsByTable.set(table.name.toLowerCase(), {
        scopeColumn: ds.scopeColumn?.trim() || undefined,
        userColumn: ds.userColumn?.trim() || undefined,
      });
    }

    const activeFilters: ResolvedTableScope[] = [];
    const contextLines: string[] = [];

    for (const table of publishedEr.tables ?? []) {
      const binding = bindingsByTable.get(table.name.toLowerCase());
      if (!binding) continue;

      const filter: ResolvedTableScope = { tableName: table.name };
      let hasFilter = false;

      if (scopeDimensionActive && binding.scopeColumn) {
        filter.scopeColumn = binding.scopeColumn;
        filter.scopeValues = [...scopeValues];
        contextLines.push(
          `表 ${table.name}：范围列 ${binding.scopeColumn}（执行层按 scopeList 自动 IN，禁止在 SQL 中手写该列过滤）`,
        );
        hasFilter = true;
      }

      if (userDimensionActive && binding.userColumn && userValue) {
        filter.userColumn = binding.userColumn;
        filter.userValue = userValue;
        contextLines.push(
          `表 ${table.name}：用户列 ${binding.userColumn}（执行层按 externalUserId 自动 =，禁止在 SQL 中手写该列过滤）`,
        );
        hasFilter = true;
      }

      if (hasFilter) {
        activeFilters.push(filter);
      }
    }

    const scopeContextText =
      contextLines.length > 0
        ? contextLines.join('；')
        : '（未配置业务数据范围约束，或入参未传 scopeList / externalUserId）';

    return {
      scopeContextText,
      scopeDimensionActive,
      userDimensionActive,
      bindingsByTable,
      activeFilters,
    };
  }
}
