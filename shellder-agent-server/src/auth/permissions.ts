/**
 * RBAC 权限目录（阶段 03）
 *
 * - 菜单权限（menus）：控制管理后台侧栏与对应路由的访问；缺失对应菜单访问路由返回 403。
 * - 模块权限（modules）：控制模块级写操作能力（与菜单解耦，便于只读 vs 维护）。
 * - 能力访问权限（capabilities）：四类业务能力（问答/查询/操作/流程）。
 * - 高风险审批权限（canApproveHighRisk）：是否可审批高风险动作。
 *
 * 通配符 `*` 表示拥有全部对应权限（超级管理员）。
 */

export const PERMISSION_WILDCARD = '*';

/** 菜单权限目录，key 与 web-console 侧栏菜单一致 */
export const MENU_CATALOG = [
  { key: 'workbench', label: '工作台' },
  { key: 'session', label: '会话管理' },
  { key: 'task', label: '任务中心' },
  { key: 'routing', label: '能力路由' },
  { key: 'skill', label: '技能书管理' },
  { key: 'tool', label: '工具管理' },
  { key: 'connector', label: '连接器管理' },
  { key: 'knowledge', label: '知识库' },
  { key: 'rule', label: '规则' },
  { key: 'approval', label: '审批中心' },
  { key: 'audit', label: '审计中心' },
  { key: 'user', label: '用户与权限' },
  { key: 'tenant', label: '租户管理' },
  { key: 'openapi', label: 'OpenAPI 管理' },
  { key: 'settings', label: '系统设置' },
] as const;

export type MenuKey = (typeof MENU_CATALOG)[number]['key'];
export const MENU_KEYS = MENU_CATALOG.map((m) => m.key) as MenuKey[];

/** 模块权限目录（模块级写/维护权限） */
export const MODULE_CATALOG = [
  { key: 'tenant.manage', label: '租户管理' },
  { key: 'user.manage', label: '用户管理' },
  { key: 'role.manage', label: '角色管理' },
  { key: 'policy.manage', label: '权限策略管理' },
  { key: 'rule.manage', label: '规则配置管理' },
  { key: 'audit.view', label: '审计查询' },
  { key: 'connector.manage', label: '连接器管理' },
  { key: 'tool.manage', label: '工具管理' },
  { key: 'skill.manage', label: '技能书管理' },
  { key: 'knowledge.manage', label: '知识库管理' },
  { key: 'session.manage', label: '会话管理' },
  { key: 'task.manage', label: '任务管理' },
  { key: 'approval.handle', label: '审批处理' },
  { key: 'settings.manage', label: '系统设置' },
] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]['key'];
export const MODULE_KEYS = MODULE_CATALOG.map((m) => m.key) as ModuleKey[];

/** 四类业务能力访问权限 */
export const CAPABILITY_CATALOG = [
  { key: 'qa', label: '问答型' },
  { key: 'query', label: '查询型' },
  { key: 'action', label: '操作型' },
  { key: 'workflow', label: '流程型' },
] as const;

export type CapabilityKey = (typeof CAPABILITY_CATALOG)[number]['key'];
export const CAPABILITY_KEYS = CAPABILITY_CATALOG.map((c) => c.key) as CapabilityKey[];

/** 角色权限策略（能力访问 + 高风险审批） */
export interface RolePolicy {
  capabilities: CapabilityKey[];
  canApproveHighRisk: boolean;
}

export const EMPTY_ROLE_POLICY: RolePolicy = {
  capabilities: [],
  canApproveHighRisk: false,
};

/** 聚合后的用户有效权限 */
export interface EffectivePermissions {
  menus: string[];
  modules: string[];
  toolScopes: string[];
  capabilities: CapabilityKey[];
  canApproveHighRisk: boolean;
  isSuperAdmin: boolean;
}

export function hasPermission(granted: string[], required: string): boolean {
  return granted.includes(PERMISSION_WILDCARD) || granted.includes(required);
}
