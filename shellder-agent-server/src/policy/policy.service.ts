import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Rule, RuleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { truncate } from '../audit/audit.constants';
import {
  MatchedRule,
  PolicyContext,
  PolicyDecision,
  PolicyResult,
  RuleConditions,
  matchConditions,
} from './policy.types';

export interface EvaluateOptions {
  /** 是否将命中规则写入 rule_hit（默认 true；预览/试评估可置 false） */
  persistHits?: boolean;
}

/**
 * Policy 模块核心（架构 §4.2 / §8）。
 *
 * 职责：
 * - 权限判断 / 风险等级判断 / 确认拦截，结合租户显式规则给出处置决策。
 * - Tool 执行前必须调用 `evaluate`（架构 §8）；07 工具、12 运行时、14 审批依赖本服务。
 *
 * 规则按 priority 升序评估（数值越小越优先）：
 * - deny           → 拦截（allow=false）
 * - need_confirm   → 需人工确认（needConfirm=true，中断执行转审批）
 * - mark_high_risk → 标记高风险（highRisk=true，供风险动作审计聚合）
 * - allow          → 显式放行（不覆盖更高优先级的 deny）
 */
@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    ctx: PolicyContext,
    options: EvaluateOptions = {},
  ): Promise<PolicyDecision> {
    const rules = await this.prisma.rule.findMany({
      where: { tenantId: ctx.tenantId, status: RuleStatus.enabled },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    let allow = true;
    let needConfirm = false;
    // 风险等级判断：Tool 自身高风险即标记（架构 §4.2）
    let highRisk = ctx.riskLevel === 'high';
    let denyReason: string | undefined;
    let confirmReason: string | undefined;
    const matchedRules: MatchedRule[] = [];

    for (const rule of rules) {
      if (!matchConditions(this.readConditions(rule), ctx)) continue;

      matchedRules.push({
        ruleId: rule.id,
        name: rule.name,
        type: rule.type,
        action: rule.action,
        priority: rule.priority,
      });

      switch (rule.action) {
        case 'deny':
          allow = false;
          denyReason ??= `命中拦截规则：${rule.name}`;
          break;
        case 'need_confirm':
          needConfirm = true;
          confirmReason ??= `命中确认拦截规则：${rule.name}`;
          break;
        case 'mark_high_risk':
          highRisk = true;
          break;
        case 'allow':
        default:
          break;
      }
    }

    const result: PolicyResult = !allow
      ? 'deny'
      : needConfirm
        ? 'need_confirm'
        : 'allow';

    const decision: PolicyDecision = {
      allow,
      needConfirm,
      highRisk,
      result,
      matchedRules,
      reason: denyReason ?? confirmReason,
    };

    if ((options.persistHits ?? true) && matchedRules.length > 0) {
      await this.persistHits(ctx, decision);
    }

    return decision;
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private readConditions(rule: Rule): RuleConditions {
    const raw = rule.conditions;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as RuleConditions;
    }
    return {};
  }

  /** 命中留痕：每条命中规则写一条 rule_hit；失败不抛出（不阻断业务主流程） */
  private async persistHits(ctx: PolicyContext, decision: PolicyDecision) {
    try {
      await this.prisma.ruleHit.createMany({
        data: decision.matchedRules.map((m) => ({
          ruleId: m.ruleId,
          tenantId: ctx.tenantId,
          ruleName: m.name,
          ruleType: m.type,
          ruleAction: m.action,
          result: decision.result,
          toolName: ctx.toolName ?? null,
          capability: ctx.capability ?? null,
          requestSummary: ctx.requestSummary ? truncate(ctx.requestSummary) : null,
          callerUserId: ctx.userId ?? null,
          sessionId: ctx.sessionId ?? null,
          taskId: ctx.taskId ?? null,
        })) satisfies Prisma.RuleHitCreateManyInput[],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `规则命中留痕失败 tenant=${ctx.tenantId} session=${ctx.sessionId ?? '-'}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
