import { ErDataScopeBinding } from './connector-schema.types';

export function hasScopeMaintenance(ds?: ErDataScopeBinding): boolean {
  return !!(ds?.scopeColumn?.trim() || ds?.scopeConfigured);
}

export function hasUserMaintenance(ds?: ErDataScopeBinding): boolean {
  return !!(ds?.userColumn?.trim() || ds?.userConfigured);
}

/** 发布前：该表的 dataScope 是否仍需人工处理 */
export function isDataScopePending(ds: ErDataScopeBinding): boolean {
  const scopeMaintained = hasScopeMaintenance(ds);
  const userMaintained = hasUserMaintenance(ds);
  if (!scopeMaintained && !userMaintained) return false;

  if (scopeMaintained && !ds.scopeColumn?.trim()) return true;
  if (userMaintained && !ds.userColumn?.trim()) return true;

  if (ds.inferred === true) {
    if (scopeMaintained && ds.scopeConfirmed !== true) return true;
    if (userMaintained && ds.userConfirmed !== true) return true;
  }
  return false;
}

/** 两维度均已确认时清除全局 inferred（与前端 confirm 逻辑一致） */
export function normalizeDataScopeBinding(ds: ErDataScopeBinding): ErDataScopeBinding {
  if (ds.inferred !== true) return ds;
  const scopeDone = !hasScopeMaintenance(ds) || ds.scopeConfirmed === true;
  const userDone = !hasUserMaintenance(ds) || ds.userConfirmed === true;
  if (scopeDone && userDone) {
    return { ...ds, inferred: false };
  }
  return ds;
}
