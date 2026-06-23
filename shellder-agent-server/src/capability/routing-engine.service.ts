import { Injectable, Logger } from '@nestjs/common';
import { CapabilityType, ToolType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { HttpQueryTriggerService } from '../tool/http-query-trigger.service';
import { CapabilityService } from './capability.service';
import { RoutingLlmClassifyService } from './routing-llm-classify.service';
import {
  CapabilityRouteResult,
  IntraCapabilityRouteResult,
  RouteFullOptions,
  RoutingCandidate,
  RoutingTestResult,
} from './dto/routing-test.dto';
import {
  evaluateRoutingConditions,
  RoutingConditionsMatchDetail,
  RoutingConditionsShape,
} from './routing-conditions.util';

/** 路由规则 conditions DSL 结构 */
interface RoutingConditions {
  keywords?: string[];
  patterns?: string[];
  intents?: string[];
  /** action 能力内可选：限定绑定的 Tool 类型 */
  toolKind?: 'http_query' | 'action' | 'notification';
  minScore?: number;
}

type CapabilityWithRules = Awaited<
  ReturnType<RoutingEngineService['loadEnabledCapabilities']>
>[number];

/**
 * 路由引擎（架构 Capability Routing / 执行计划 §4）。
 *
 * 两阶段路由：
 * - Stage1 routeCapability：跨类型规则 + 启发式（pinned 时跳过跨类型）
 * - Stage2 routeWithinCapability：能力内 routing_rule → toolIds
 */
@Injectable()
export class RoutingEngineService {
  private readonly logger = new Logger(RoutingEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
    private readonly capabilityService: CapabilityService,
    private readonly httpQueryTrigger: HttpQueryTriggerService,
    private readonly llmClassify: RoutingLlmClassifyService,
  ) {}

  /** Stage1：跨能力类型路由（session 未锁定类型时） */
  async routeCapability(
    tenantId: string,
    input: string,
    options?: Pick<RouteFullOptions, 'pinnedCapabilityType' | 'enableLlmClassify'>,
  ): Promise<CapabilityRouteResult> {
    const ctx = await this.prepareTenantContext(tenantId);
    if (!ctx) {
      const fallback = this.fallbackResult('租户不存在');
      return {
        capabilityType: fallback.capabilityType as CapabilityType,
        capabilityName: fallback.capabilityName,
        reason: fallback.reason,
        confidence: 0,
        pinned: false,
        candidates: [],
      };
    }

    if (ctx.errorReason) {
      return {
        capabilityType: 'qa',
        capabilityName: this.typeLabel('qa'),
        reason: ctx.errorReason,
        confidence: 0,
        pinned: false,
        candidates: [],
      };
    }

    const { allowedTypes } = ctx;

    if (options?.pinnedCapabilityType) {
      const pinned = options.pinnedCapabilityType;
      if (allowedTypes.length > 0 && !allowedTypes.includes(pinned)) {
        return {
          capabilityType: pinned,
          capabilityName: this.typeLabel(pinned),
          reason: `定向锁定：${this.typeLabel(pinned)}（该租户未开通此能力类型）`,
          confidence: 1,
          pinned: true,
          candidates: [],
        };
      }

      const cap = await this.prisma.capability.findFirst({
        where: { tenantId, status: 'enabled', type: pinned },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        capabilityType: pinned,
        capabilityName: cap?.name ?? this.typeLabel(pinned),
        reason: `定向锁定：${cap?.name ?? this.typeLabel(pinned)}`,
        confidence: 1,
        pinned: true,
        candidates: cap
          ? [
              {
                capabilityId: cap.id,
                capabilityName: cap.name,
                type: cap.type,
                score: 100,
                toolIds: this.readToolIds(cap.dependentTools),
              },
            ]
          : [],
      };
    }

    const capabilities = await this.loadEnabledCapabilities(tenantId, allowedTypes);
    if (capabilities.length === 0) {
      return {
        capabilityType: 'qa',
        capabilityName: this.typeLabel('qa'),
        reason: '该租户无可用能力配置',
        confidence: 0,
        pinned: false,
        candidates: [],
      };
    }

    const candidates = this.scoreCapabilities(input, capabilities);
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      const inferred = this.inferTypeByKeywords(input, allowedTypes);
      return (
        (await this.maybeApplyLlmClassify(tenantId, input, allowedTypes, inferred, options)) ??
        inferred
      );
    }

    const best = candidates[0];
    const confidence = this.computeConfidence(best.score, candidates[1]?.score);
    const ruleResult: CapabilityRouteResult = {
      capabilityType: best.type as CapabilityType,
      capabilityName: best.capabilityName,
      reason: `路由命中：${best.capabilityName}（得分 ${best.score}）`,
      confidence,
      pinned: false,
      candidates,
    };

    if (confidence < 0.5) {
      return (
        (await this.maybeApplyLlmClassify(tenantId, input, allowedTypes, ruleResult, options)) ??
        ruleResult
      );
    }

    return ruleResult;
  }

  /** Stage2：能力内 Tool/规则匹配（定向与自动模式均调用） */
  async routeWithinCapability(
    tenantId: string,
    capabilityType: CapabilityType,
    input: string,
    userId?: string,
  ): Promise<IntraCapabilityRouteResult> {
    const ctx = await this.prepareTenantContext(tenantId);
    if (!ctx) {
      return {
        toolIds: [],
        reason: '租户不存在',
        needConfirmation: false,
      };
    }

    const cap = await this.prisma.capability.findFirst({
      where: { tenantId, status: 'enabled', type: capabilityType },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        routingRules: {
          where: { status: 'enabled' },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!cap) {
      return {
        toolIds: [],
        reason: `未找到 ${this.typeLabel(capabilityType)} 能力配置`,
        needConfirmation: false,
      };
    }

    let bestScore = 0;
    let matchedRule: (typeof cap.routingRules)[number] | undefined;
    let matchedToolIds: string[] = [];
    let matchedToolKind: string | undefined;

    for (const rule of cap.routingRules) {
      const conditions = this.readConditions(rule.conditions);
      const score = this.calculateScore(input, conditions);
      if (score <= bestScore) continue;

      const rawToolIds = this.readToolIds(rule.toolIds);
      const filteredToolIds = await this.filterToolIdsByKind(
        tenantId,
        rawToolIds,
        conditions.toolKind,
      );
      if (conditions.toolKind && filteredToolIds.length === 0 && rawToolIds.length > 0) {
        continue;
      }

      bestScore = score;
      matchedRule = rule;
      matchedToolIds = filteredToolIds.length > 0 ? filteredToolIds : rawToolIds;
      matchedToolKind = conditions.toolKind;
    }

    if (bestScore > 0 && matchedRule) {
      const policyNeedConfirm = await this.checkNeedConfirmation(
        tenantId,
        capabilityType,
        matchedToolIds,
        userId,
      );
      const needConfirmation = matchedRule.needConfirmation || policyNeedConfirm;
      return {
        toolIds: matchedToolIds,
        ruleId: matchedRule.id,
        ruleName: matchedRule.name,
        reason: `命中规则「${matchedRule.name}」（得分 ${bestScore}）`,
        needConfirmation,
        toolKind: matchedToolKind,
      };
    }

    if (capabilityType === 'action') {
      const signalResult = await this.resolveActionIntraFromSignal(tenantId, input, userId);
      if (signalResult) {
        return signalResult;
      }
    }

    const dependentToolIds = this.readToolIds(cap.dependentTools);
    const needConfirmation = await this.checkNeedConfirmation(
      tenantId,
      capabilityType,
      dependentToolIds,
      userId,
    );

    return {
      toolIds: [],
      reason: '未命中能力内路由规则',
      needConfirmation,
    };
  }

  /** 编排入口：Stage1 + Stage2，供 Runtime / 路由测试使用 */
  async routeFull(
    tenantId: string,
    input: string,
    options?: RouteFullOptions,
  ): Promise<RoutingTestResult> {
    const typeResult = await this.routeCapability(tenantId, input, {
      pinnedCapabilityType: options?.pinnedCapabilityType,
      enableLlmClassify: options?.enableLlmClassify,
    });

    const intraResult = await this.routeWithinCapability(
      tenantId,
      typeResult.capabilityType,
      input,
      options?.userId,
    );

    const typeStage = {
      reason: typeResult.reason,
      confidence: typeResult.confidence,
      pinned: typeResult.pinned,
    };

    const intraStage = {
      ruleId: intraResult.ruleId,
      ruleName: intraResult.ruleName,
      toolIds: intraResult.toolIds,
      reason: intraResult.reason,
      toolKind: intraResult.toolKind,
      signalToolCode: intraResult.signalToolCode,
    };

    const mergedReason = typeResult.pinned
      ? `${typeResult.reason}；能力内：${intraResult.reason}`
      : `${typeResult.reason}；能力内：${intraResult.reason}`;

    return {
      capabilityType: typeResult.capabilityType,
      capabilityName: typeResult.capabilityName,
      reason: mergedReason,
      candidates: typeResult.candidates,
      needConfirmation: intraResult.needConfirmation,
      typeStage,
      intraStage,
    };
  }

  /**
   * 路由测试（API POST /api/v1/routing/test）。
   * 输入测试语句 → 命中能力类型、理由、候选能力、是否需确认。
   */
  async routeTest(
    tenantId: string,
    input: string,
    userId?: string,
    options?: Pick<RouteFullOptions, 'pinnedCapabilityType'>,
  ): Promise<RoutingTestResult> {
    return this.routeFull(tenantId, input, {
      userId,
      pinnedCapabilityType: options?.pinnedCapabilityType,
    });
  }

  /** 供 Agent Runtime 调用的路由方法（统一能力入口协议） */
  async route(tenantId: string, input: string, userId?: string): Promise<RoutingTestResult> {
    return this.routeFull(tenantId, input, { userId });
  }

  /**
   * 定向选择能力类型：锁定类型 + 必须执行 Stage2。
   * @deprecated 语义变更 — 现为 routeFull 的薄封装（pinned + Stage2）
   */
  async routeDirected(
    tenantId: string,
    capabilityType: CapabilityType,
    input: string,
    userId?: string,
  ): Promise<RoutingTestResult> {
    return this.routeFull(tenantId, input, {
      pinnedCapabilityType: capabilityType,
      userId,
    });
  }

  // ── 租户上下文 ──────────────────────────────────────────

  private async prepareTenantContext(
    tenantId: string,
  ): Promise<{ allowedTypes: string[]; errorReason?: string } | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return null;

    const tenantConfig = tenant.config as { capabilities?: string[] } | null;
    const allowedTypes = tenantConfig?.capabilities ?? [];
    if (allowedTypes.length === 0) {
      return {
        allowedTypes: [],
        errorReason: '该租户未配置开通能力范围，请在租户管理中至少选择一种能力',
      };
    }

    await this.capabilityService.ensureDefaultCapabilities(tenantId);
    return { allowedTypes };
  }

  private async loadEnabledCapabilities(tenantId: string, allowedTypes: string[]) {
    return this.prisma.capability.findMany({
      where: { tenantId, status: 'enabled', type: { in: allowedTypes as CapabilityType[] } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        routingRules: {
          where: { status: 'enabled' },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  private scoreCapabilities(input: string, capabilities: CapabilityWithRules[]): RoutingCandidate[] {
    const candidates: RoutingCandidate[] = [];

    for (const cap of capabilities) {
      let maxScore = 0;
      let matchedToolIds: string[] = [];

      for (const rule of cap.routingRules) {
        const conditions = this.readConditions(rule.conditions);
        const score = this.calculateScore(input, conditions);
        if (score > maxScore) {
          maxScore = score;
          matchedToolIds = this.readToolIds(rule.toolIds);
        }
      }

      if (maxScore > 0) {
        candidates.push({
          capabilityId: cap.id,
          capabilityName: cap.name,
          type: cap.type,
          score: maxScore,
          toolIds: matchedToolIds,
        });
      }
    }

    return candidates;
  }

  private computeConfidence(bestScore: number, secondScore?: number): number {
    if (bestScore <= 0) return 0.2;
    if (secondScore === undefined || secondScore === 0) {
      return Math.min(0.5 + bestScore / 100, 1);
    }
    const gap = bestScore - secondScore;
    return Math.min(0.4 + gap / 50 + bestScore / 200, 1);
  }

  // ── 匹配算法 ────────────────────────────────────────────

  /**  dry-run：仅评估 conditions 与输入的匹配（供规则编辑页即时测试） */
  evaluateConditions(
    input: string,
    conditions: RoutingConditionsShape,
  ): RoutingConditionsMatchDetail {
    return evaluateRoutingConditions(input, conditions);
  }

  private calculateScore(input: string, conditions: RoutingConditions): number {
    return evaluateRoutingConditions(input, conditions).score;
  }

  /** 无规则命中时，按内置关键词启发式推断能力类型 */
  private inferTypeByKeywords(
    input: string,
    allowedTypes: string[],
  ): CapabilityRouteResult {
    const lower = input.toLowerCase();

    const typeScores: Record<string, number> = { qa: 0, query: 0, action: 0, workflow: 0 };

    const qaKeywords = ['什么', '为什么', '怎么', '是什么', '如何', '吗', '呢', '请问', '帮我解释', 'what', 'why', 'how', 'explain'];
    const queryKeywords = ['查询', '查看', '搜索', '获取', '列出', '统计', '报表', '查', 'select', 'query', 'find', 'list', 'count'];
    const actionKeywords = ['创建', '修改', '删除', '更新', '执行', '发送', '提交', '操作', 'create', 'update', 'delete', 'execute', 'send'];
    const workflowKeywords = ['流程', '审批', '编排', '批量', '自动', '调度', 'workflow', 'process', 'batch', 'schedule'];

    for (const kw of qaKeywords) if (lower.includes(kw)) typeScores.qa += 5;
    for (const kw of queryKeywords) if (lower.includes(kw)) typeScores.query += 5;
    for (const kw of actionKeywords) if (lower.includes(kw)) typeScores.action += 5;
    for (const kw of workflowKeywords) if (lower.includes(kw)) typeScores.workflow += 5;

    const filtered = Object.entries(typeScores)
      .filter(([type]) => allowedTypes.includes(type))
      .sort((a, b) => b[1] - a[1]);

    const [bestType, bestScore] = filtered[0] ?? ['qa', 0];

    if (bestScore === 0) {
      const defaultType = allowedTypes.includes('qa') ? 'qa' : allowedTypes[0];
      return {
        capabilityType: defaultType as CapabilityType,
        capabilityName: this.typeLabel(defaultType),
        reason: '未命中路由规则，回退为默认能力类型',
        confidence: 0.2,
        pinned: false,
        candidates: [],
      };
    }

    return {
      capabilityType: bestType as CapabilityType,
      capabilityName: this.typeLabel(bestType),
      reason: `启发式推断：命中 ${bestType} 类型关键词（得分 ${bestScore}）`,
      confidence: Math.min(0.3 + bestScore / 50, 0.6),
      pinned: false,
      candidates: filtered
        .filter(([, s]) => s > 0)
        .map(([type, score]) => ({
          capabilityId: '',
          capabilityName: this.typeLabel(type),
          type,
          score,
          toolIds: [],
        })),
    };
  }

  private async maybeApplyLlmClassify(
    tenantId: string,
    input: string,
    allowedTypes: string[],
    fallback: CapabilityRouteResult,
    options?: Pick<RouteFullOptions, 'enableLlmClassify'>,
  ): Promise<CapabilityRouteResult | null> {
    const enabled =
      options?.enableLlmClassify ??
      (await this.llmClassify.isEnabled(tenantId));
    if (!enabled) return null;

    const llmResult = await this.llmClassify.classify(tenantId, input, allowedTypes);
    if (!llmResult) return null;

    return {
      capabilityType: llmResult.capabilityType,
      capabilityName: this.typeLabel(llmResult.capabilityType),
      reason: `LLM 分类：${llmResult.reason}`,
      confidence: llmResult.confidence,
      pinned: false,
      candidates: fallback.candidates,
    };
  }

  private async filterToolIdsByKind(
    tenantId: string,
    toolIds: string[],
    toolKind?: RoutingConditions['toolKind'],
  ): Promise<string[]> {
    if (!toolKind || toolIds.length === 0) return toolIds;

    const tools = await this.prisma.tool.findMany({
      where: {
        tenantId,
        id: { in: toolIds },
        status: 'enabled',
        type: toolKind as ToolType,
      },
      select: { id: true },
    });
    return tools.map((t) => t.id);
  }

  private async resolveActionIntraFromSignal(
    tenantId: string,
    input: string,
    userId?: string,
  ): Promise<IntraCapabilityRouteResult | null> {
    const signal = this.httpQueryTrigger.parseSignal(input);
    if (!signal) return null;

    const tool = await this.httpQueryTrigger.findByToolCode(tenantId, signal.toolCode);
    if (!tool) {
      return {
        toolIds: [],
        reason: `检测到 HTTP 查询信号，但未找到 toolCode=${signal.toolCode}`,
        needConfirmation: false,
        toolKind: 'http_query',
        signalToolCode: signal.toolCode,
      };
    }

    const needConfirmation = await this.checkNeedConfirmation(
      tenantId,
      'action',
      [tool.id],
      userId,
    );

    return {
      toolIds: [tool.id],
      reason: `HTTP 查询信号命中 toolCode=${signal.toolCode}`,
      needConfirmation,
      toolKind: 'http_query',
      signalToolCode: signal.toolCode,
    };
  }

  private async checkNeedConfirmation(
    tenantId: string,
    capabilityType: string,
    toolIds: string[],
    userId?: string,
  ): Promise<boolean> {
    try {
      if (toolIds.length > 0) {
        const tools = await this.prisma.tool.findMany({
          where: { id: { in: toolIds }, tenantId, status: 'enabled' },
        });
        for (const tool of tools) {
          const decision = await this.policyService.evaluate(
            {
              tenantId,
              userId: userId ?? null,
              toolId: tool.id,
              toolName: tool.name,
              riskLevel: tool.riskLevel as 'low' | 'medium' | 'high',
              needConfirmation: tool.needConfirmation,
              capability: capabilityType,
              permissionScope: tool.permissionScope,
            },
            { persistHits: false },
          );
          if (decision.needConfirm) return true;
        }
        return false;
      }

      const decision = await this.policyService.evaluate(
        {
          tenantId,
          capability: capabilityType,
          userId: userId ?? null,
        },
        { persistHits: false },
      );
      return decision.needConfirm;
    } catch {
      return false;
    }
  }

  private readConditions(raw: unknown): RoutingConditions {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as RoutingConditions;
    }
    return {};
  }

  private readToolIds(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === 'string');
    }
    return [];
  }

  private typeLabel(type: string): string {
    const labels: Record<string, string> = {
      qa: '问答型',
      query: '查询型',
      action: '操作型',
      workflow: '流程型',
    };
    return labels[type] ?? type;
  }

  private fallbackResult(reason: string): RoutingTestResult {
    return {
      capabilityType: 'qa',
      capabilityName: '问答型',
      reason,
      candidates: [],
      needConfirmation: false,
    };
  }
}
