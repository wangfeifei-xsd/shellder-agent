import { RuleAction, RuleType } from '@prisma/client';

/** Tool 风险等级（07 工具注册定义；此处为 Policy 评估输入） */
export type RiskLevel = 'low' | 'medium' | 'high';

/** 最终处置结果 */
export type PolicyResult = 'allow' | 'deny' | 'need_confirm';

/**
 * Policy 评估上下文（架构 §4.2）。
 * Tool 执行前由调用方（07 工具 / 12 运行时 / 14 审批）构造并传入。
 * 07 之前各字段可由 Mock 提供以验证规则链路（验收标准 1）。
 */
export interface PolicyContext {
  tenantId: string;
  /** 触发请求的用户（如有） */
  userId?: string | null;
  /** 目标 Tool 名称 */
  toolName?: string | null;
  /** 目标 Tool 主键（07） */
  toolId?: string | null;
  /** Tool 自身风险等级（07 riskLevel） */
  riskLevel?: RiskLevel | null;
  /** Tool 自身的「需确认」标记（07 needConfirmation） */
  needConfirmation?: boolean | null;
  /** 本次请求归属的业务能力（qa/query/action/workflow） */
  capability?: string | null;
  /** Tool 权限范围（07 permissionScope） */
  permissionScope?: string | null;
  /** 调用方拥有的能力权限（来自 RBAC，用于能力级限制判断） */
  userCapabilities?: string[];
  /** 请求摘要（脱敏，用于命中留痕） */
  requestSummary?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  /** 调用人显示名（命中留痕快照） */
  callerName?: string | null;
}

/** 规则匹配条件 DSL（rule.conditions JSON 结构）。所有字段可选；省略即不约束该维度。 */
export interface RuleConditions {
  /** 子句匹配模式：all=全部满足（默认）、any=任一满足 */
  match?: 'all' | 'any';
  /** 命中的 Tool 名称（精确，命中其一即满足该子句） */
  toolNames?: string[];
  /** Tool 名称包含匹配（不区分大小写） */
  toolNameContains?: string;
  /** 命中的风险等级 */
  riskLevels?: RiskLevel[];
  /** 命中的业务能力 */
  capabilities?: string[];
  /** 命中 Tool 自身 needConfirmation 标记 */
  needConfirmation?: boolean;
  /** 命中的 Tool 权限范围 */
  permissionScopes?: string[];
}

/** 单条命中明细 */
export interface MatchedRule {
  ruleId: string;
  name: string;
  type: RuleType;
  action: RuleAction;
  priority: number;
}

/** Policy 评估决策（架构 §4.2 / API 要点：{ allow, needConfirm, matchedRules }） */
export interface PolicyDecision {
  allow: boolean;
  needConfirm: boolean;
  highRisk: boolean;
  result: PolicyResult;
  matchedRules: MatchedRule[];
  /** 处置原因（deny/need_confirm 时给出首要命中规则说明） */
  reason?: string;
}

function lc(value?: string | null): string {
  return (value ?? '').toLowerCase();
}

/**
 * 判断规则条件是否命中评估上下文。
 * - 未配置任何子句 → 视为租户内全量匹配（命中）。
 * - match=all（默认）：所有已配置子句均满足才命中；match=any：任一满足即命中。
 */
export function matchConditions(
  conditions: RuleConditions | null | undefined,
  ctx: PolicyContext,
): boolean {
  const cond = conditions ?? {};
  const clauses: boolean[] = [];

  if (cond.toolNames && cond.toolNames.length > 0) {
    clauses.push(!!ctx.toolName && cond.toolNames.includes(ctx.toolName));
  }
  if (cond.toolNameContains) {
    clauses.push(lc(ctx.toolName).includes(lc(cond.toolNameContains)));
  }
  if (cond.riskLevels && cond.riskLevels.length > 0) {
    clauses.push(!!ctx.riskLevel && cond.riskLevels.includes(ctx.riskLevel));
  }
  if (cond.capabilities && cond.capabilities.length > 0) {
    clauses.push(!!ctx.capability && cond.capabilities.includes(ctx.capability));
  }
  if (cond.needConfirmation !== undefined) {
    clauses.push(!!ctx.needConfirmation === cond.needConfirmation);
  }
  if (cond.permissionScopes && cond.permissionScopes.length > 0) {
    clauses.push(
      !!ctx.permissionScope && cond.permissionScopes.includes(ctx.permissionScope),
    );
  }

  // 无任何已配置子句：全量匹配
  if (clauses.length === 0) return true;

  return cond.match === 'any'
    ? clauses.some(Boolean)
    : clauses.every(Boolean);
}
