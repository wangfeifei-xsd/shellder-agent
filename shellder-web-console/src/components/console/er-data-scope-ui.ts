import type { ErDataScopeBinding, ErTableNode } from '@/lib/connector';

export type DataScopeDimension = 'scope' | 'user';

export const DATA_SCOPE_PANEL_HINT =
  '范围列与用户列分开维护：分别绑定嵌入 scopeList、externalUserId 到本表物理列，运行期由 SQL 执行层强制过滤。';

export const SCOPE_DIMENSION_TITLE = '范围列映射（scopeList）';
export const USER_DIMENSION_TITLE = '用户列映射（externalUserId）';

export const SCOPE_COLUMN_TOOLTIP =
  '本表物理列。嵌入 scopeList（部门/组织 ID 列表）运行期对此列 IN；未传 scopeList 时不生效。';

export const USER_COLUMN_TOOLTIP =
  '本表物理列。嵌入 externalUserId 运行期对此列 =；未传时不生效。';

export const PHYSICAL_COLUMN_PLACEHOLDER = '选择物理列';

export const RESERVED_EMBED_PARAM_NAMES = new Set([
  'scopelist',
  'scope_list',
  'externaluserid',
  'external_user_id',
]);

export function isReservedEmbedParamName(name: string): boolean {
  return RESERVED_EMBED_PARAM_NAMES.has(name.trim().toLowerCase());
}

export function hasScopeMaintenance(ds?: ErDataScopeBinding): boolean {
  return !!(ds?.scopeColumn?.trim() || ds?.scopeConfigured);
}

export function hasUserMaintenance(ds?: ErDataScopeBinding): boolean {
  return !!(ds?.userColumn?.trim() || ds?.userConfigured);
}

/** 该维度是否纳入维护列表 */
export function tableInDimension(row: ErTableNode, dim: DataScopeDimension): boolean {
  return dim === 'scope' ? hasScopeMaintenance(row.dataScope) : hasUserMaintenance(row.dataScope);
}

export function filterTablesByDimension(
  tables: ErTableNode[],
  dim: DataScopeDimension,
): ErTableNode[] {
  return tables.filter((t) => tableInDimension(t, dim));
}

export function dimensionColumn(ds: ErDataScopeBinding | undefined, dim: DataScopeDimension): string | undefined {
  return dim === 'scope' ? ds?.scopeColumn : ds?.userColumn;
}

export function dimensionStatus(
  ds: ErDataScopeBinding | undefined,
  dim: DataScopeDimension,
): '推断' | '已确认' | '待配置' {
  const maintained = dim === 'scope' ? hasScopeMaintenance(ds) : hasUserMaintenance(ds);
  const col = dimensionColumn(ds, dim);
  if (!maintained) return '待配置';
  if (!col?.trim()) return '待配置';

  const confirmed = dim === 'scope' ? ds.scopeConfirmed === true : ds.userConfirmed === true;
  if (confirmed) return '已确认';

  // 按维度独立判断：LLM 推断或显式 scopeConfirmed/userConfirmed=false 时待确认
  const explicitlyPending =
    dim === 'scope' ? ds.scopeConfirmed === false : ds.userConfirmed === false;
  if (ds.inferred === true || explicitlyPending) return '推断';

  // 手动配置（无 LLM 推断标记）视为已确认
  return '已确认';
}

/** 发布前：该表 dataScope 是否仍需人工处理（与后端 isDataScopePending 一致） */
export function isDataScopePending(ds: ErDataScopeBinding): boolean {
  const scopeMaintained = hasScopeMaintenance(ds);
  const userMaintained = hasUserMaintenance(ds);
  if (!scopeMaintained && !userMaintained) return false;

  if (scopeMaintained && !ds.scopeColumn?.trim()) return true;
  if (userMaintained && !ds.userColumn?.trim()) return true;

  if (
    scopeMaintained &&
    ds.scopeColumn?.trim() &&
    ds.scopeConfirmed !== true &&
    (ds.inferred === true || ds.scopeConfirmed === false)
  ) {
    return true;
  }
  if (
    userMaintained &&
    ds.userColumn?.trim() &&
    ds.userConfirmed !== true &&
    (ds.inferred === true || ds.userConfirmed === false)
  ) {
    return true;
  }
  return false;
}

export function countPendingDataScopeTables(tables: ErTableNode[]): number {
  return tables.filter((t) => t.dataScope && isDataScopePending(t.dataScope)).length;
}

/** 两维度均已确认时清除全局 inferred */
export function normalizeDataScopeBinding(ds: ErDataScopeBinding): ErDataScopeBinding {
  if (ds.inferred !== true) return ds;
  const scopeDone = !hasScopeMaintenance(ds) || ds.scopeConfirmed === true;
  const userDone = !hasUserMaintenance(ds) || ds.userConfirmed === true;
  if (scopeDone && userDone) {
    return { ...ds, inferred: false };
  }
  return ds;
}

export function normalizeDiagramDataScope(diagram: { tables?: ErTableNode[] }): {
  tables?: ErTableNode[];
} {
  return {
    ...diagram,
    tables: (diagram.tables ?? []).map((table) => {
      if (!table.dataScope) return table;
      return { ...table, dataScope: normalizeDataScopeBinding(table.dataScope) };
    }),
  };
}

/** 确认某一维度的列映射；两维度均确认后清除全局 inferred */
export function confirmDataScopeDimension(
  ds: ErDataScopeBinding,
  dim: DataScopeDimension,
): ErDataScopeBinding {
  const next: ErDataScopeBinding = {
    ...ds,
    scopeConfirmed: dim === 'scope' ? true : ds.scopeConfirmed,
    userConfirmed: dim === 'user' ? true : ds.userConfirmed,
  };
  const normalized = normalizeDataScopeBinding(next);
  return pruneDataScope(normalized) ?? normalized;
}

/** 一键确认：清除所有待处理表的 inferred 并标记两维度已确认 */
export function confirmAllDataScopeBindings(
  tables: ErTableNode[],
): ErTableNode[] {
  return tables.map((t) => {
    if (!t.dataScope || !isDataScopePending(t.dataScope)) return t;
    return {
      ...t,
      dataScope: {
        ...t.dataScope,
        inferred: false,
        scopeConfirmed: true,
        userConfirmed: true,
      },
    };
  });
}

export function pruneDataScope(ds: ErDataScopeBinding | undefined): ErDataScopeBinding | undefined {
  if (!ds) return undefined;
  const next = { ...ds };
  if (!next.scopeColumn?.trim()) next.scopeColumn = undefined;
  if (!next.userColumn?.trim()) next.userColumn = undefined;
  if (!hasScopeMaintenance(next) && !hasUserMaintenance(next)) {
    return undefined;
  }
  if (!hasScopeMaintenance(next)) {
    next.scopeColumn = undefined;
    next.scopeConfigured = false;
  }
  if (!hasUserMaintenance(next)) {
    next.userColumn = undefined;
    next.userConfigured = false;
  }
  if (!next.scopeColumn && !next.userColumn && next.inferred !== true && !next.reason?.trim()) {
    return undefined;
  }
  return next;
}

export function patchDataScopeDimension(
  existing: ErDataScopeBinding | undefined,
  dim: DataScopeDimension,
  patch: Partial<ErDataScopeBinding> & { column?: string | undefined },
): ErDataScopeBinding | undefined {
  const base: ErDataScopeBinding = { ...existing };
  if (dim === 'scope') {
    base.scopeConfigured = true;
    if ('column' in patch) base.scopeColumn = patch.column;
    if (patch.scopeColumn !== undefined) base.scopeColumn = patch.scopeColumn;
  } else {
    base.userConfigured = true;
    if ('column' in patch) base.userColumn = patch.column;
    if (patch.userColumn !== undefined) base.userColumn = patch.userColumn;
  }
  if (patch.reason !== undefined) base.reason = patch.reason;
  if (patch.inferred !== undefined) {
    if (patch.inferred === false) {
      // 手动改列：仅确认当前维度，不清除全局 inferred（避免另一维度误显示已确认）
      if (dim === 'scope') base.scopeConfirmed = true;
      else base.userConfirmed = true;
    } else {
      base.inferred = patch.inferred;
    }
  }
  const pruned = pruneDataScope(base);
  if (!pruned) return undefined;
  return normalizeDataScopeBinding(pruned);
}

export function removeDataScopeDimension(
  existing: ErDataScopeBinding | undefined,
  dim: DataScopeDimension,
): ErDataScopeBinding | undefined {
  if (!existing) return undefined;
  const next = { ...existing };
  if (dim === 'scope') {
    next.scopeColumn = undefined;
    next.scopeConfigured = false;
  } else {
    next.userColumn = undefined;
    next.userConfigured = false;
  }
  return pruneDataScope(next);
}

export function initDataScopeForDimension(dim: DataScopeDimension): ErDataScopeBinding {
  return dim === 'scope'
    ? { scopeConfigured: true, inferred: false, reason: '手动配置范围列' }
    : { userConfigured: true, inferred: false, reason: '手动配置用户列' };
}

/** LLM 建议写入后标记维度已维护 */
export function markConfiguredFromLlm(ds: ErDataScopeBinding): ErDataScopeBinding {
  return {
    ...ds,
    scopeConfigured: !!ds.scopeColumn?.trim() || ds.scopeConfigured,
    userConfigured: !!ds.userColumn?.trim() || ds.userConfigured,
  };
}

export function countInferredInDimension(
  tables: ErTableNode[],
  dim: DataScopeDimension,
): number {
  return filterTablesByDimension(tables, dim).filter(
    (t) => dimensionStatus(t.dataScope, dim) === '推断',
  ).length;
}
