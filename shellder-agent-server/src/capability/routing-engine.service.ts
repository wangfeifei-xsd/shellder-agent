import { Injectable, Logger } from '@nestjs/common';
import { CapabilityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { CapabilityService } from './capability.service';
import { RoutingCandidate, RoutingTestResult } from './dto/routing-test.dto';

/** 路由规则 conditions DSL 结构 */
interface RoutingConditions {
  /** 关键词列表（命中任一即匹配） */
  keywords?: string[];
  /** 正则表达式模式（命中任一即匹配） */
  patterns?: string[];
  /** 意图标签（保留，供后续 NLU 引擎扩展） */
  intents?: string[];
}

/**
 * 路由引擎（架构 Capability Routing / 执行计划 §4）。
 *
 * Agent Runtime 调用本模块将用户请求路由到四类能力之一。
 * 可独立调用（不经完整 Tool 编排）供「路由测试」、调试台使用。
 *
 * 路由算法：
 * 1. 获取租户启用能力（按 priority 升序）。
 * 2. 验证能力类型是否在租户 config.capabilities 范围内（验收标准 2）。
 * 3. 对每个能力的路由规则逐一匹配 conditions（关键词/正则/意图）。
 * 4. 计算匹配分数，取最高分能力作为路由结果。
 * 5. 结合 Policy 判断 needConfirmation（验收标准 3）。
 */
@Injectable()
export class RoutingEngineService {
  private readonly logger = new Logger(RoutingEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
    private readonly capabilityService: CapabilityService,
  ) {}

  /**
   * 路由测试（API POST /api/v1/routing/test）。
   * 输入测试语句 → 命中能力类型、理由、候选能力、是否需确认。
   */
  async routeTest(tenantId: string, input: string, userId?: string): Promise<RoutingTestResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return this.fallbackResult('租户不存在');
    }

    const tenantConfig = tenant.config as { capabilities?: string[] } | null;
    const allowedTypes = tenantConfig?.capabilities ?? [];
    if (allowedTypes.length === 0) {
      return this.fallbackResult(
        '该租户未配置开通能力范围，请在租户管理中至少选择一种能力',
      );
    }

    await this.capabilityService.ensureDefaultCapabilities(tenantId);

    const capabilities = await this.prisma.capability.findMany({
      where: { tenantId, status: 'enabled', type: { in: allowedTypes as CapabilityType[] } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        routingRules: {
          where: { status: 'enabled' },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (capabilities.length === 0) {
      return this.fallbackResult('该租户无可用能力配置');
    }

    const candidates: RoutingCandidate[] = [];

    for (const cap of capabilities) {
      let maxScore = 0;
      let matchedToolIds: string[] = [];
      let matchedReason = '';

      for (const rule of cap.routingRules) {
        const conditions = this.readConditions(rule.conditions);
        const score = this.calculateScore(input, conditions);
        if (score > maxScore) {
          maxScore = score;
          matchedToolIds = this.readToolIds(rule.toolIds);
          matchedReason = `命中规则「${rule.name}」`;
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

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return this.inferByKeywords(input, allowedTypes, tenantId);
    }

    const best = candidates[0];

    const needConfirmation = await this.checkNeedConfirmation(
      tenantId,
      best.type,
      best.toolIds,
      userId,
    );

    return {
      capabilityType: best.type,
      capabilityName: best.capabilityName,
      reason: `路由命中：${best.capabilityName}（得分 ${best.score}）`,
      candidates,
      needConfirmation,
    };
  }

  /**
   * 供 Agent Runtime 调用的路由方法（统一能力入口协议）。
   * 返回路由结果（不写命中记录，由 Runtime 决定是否持久化）。
   */
  async route(tenantId: string, input: string, userId?: string): Promise<RoutingTestResult> {
    return this.routeTest(tenantId, input, userId);
  }

  /**
   * 定向选择能力类型（演示页 / 嵌入 Copilot / 业务系统显式指定）。
   * 不执行关键词、规则或启发式路由匹配。
   */
  async routeDirected(
    tenantId: string,
    capabilityType: CapabilityType,
    userId?: string,
  ): Promise<RoutingTestResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return this.fallbackResult('租户不存在');
    }

    const tenantConfig = tenant.config as { capabilities?: string[] } | null;
    const allowedTypes = tenantConfig?.capabilities ?? [];
    if (allowedTypes.length > 0 && !allowedTypes.includes(capabilityType)) {
      return {
        capabilityType,
        capabilityName: this.typeLabel(capabilityType),
        reason: `定向选择：${this.typeLabel(capabilityType)}（该租户未开通此能力类型）`,
        candidates: [],
        needConfirmation: false,
      };
    }

    await this.capabilityService.ensureDefaultCapabilities(tenantId);

    const cap = await this.prisma.capability.findFirst({
      where: { tenantId, status: 'enabled', type: capabilityType },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const toolIds = cap ? this.readToolIds(cap.dependentTools) : [];
    const needConfirmation = await this.checkNeedConfirmation(
      tenantId,
      capabilityType,
      toolIds,
      userId,
    );

    const capabilityName = cap?.name ?? this.typeLabel(capabilityType);
    const candidate: RoutingCandidate = {
      capabilityId: cap?.id ?? '',
      capabilityName,
      type: capabilityType,
      score: 100,
      toolIds,
    };

    return {
      capabilityType,
      capabilityName,
      reason: `定向选择：${capabilityName}（不使用路由匹配）`,
      candidates: [candidate],
      needConfirmation,
    };
  }

  // ── 匹配算法 ────────────────────────────────────────────

  private calculateScore(input: string, conditions: RoutingConditions): number {
    let score = 0;
    const lowerInput = input.toLowerCase();

    if (conditions.keywords && conditions.keywords.length > 0) {
      for (const kw of conditions.keywords) {
        if (lowerInput.includes(kw.toLowerCase())) {
          score += 10;
        }
      }
    }

    if (conditions.patterns && conditions.patterns.length > 0) {
      for (const pattern of conditions.patterns) {
        try {
          const re = new RegExp(pattern, 'i');
          if (re.test(input)) {
            score += 20;
          }
        } catch {
          // 无效正则跳过
        }
      }
    }

    if (conditions.intents && conditions.intents.length > 0) {
      // 保留接口，后续接入 NLU/LLM 意图识别
      // 当前简单用关键词近似匹配
      for (const intent of conditions.intents) {
        if (lowerInput.includes(intent.toLowerCase())) {
          score += 15;
        }
      }
    }

    return score;
  }

  /** 无规则命中时，按内置关键词启发式推断能力类型 */
  private inferByKeywords(
    input: string,
    allowedTypes: string[],
    tenantId: string,
  ): RoutingTestResult {
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
        capabilityType: defaultType,
        capabilityName: this.typeLabel(defaultType),
        reason: '未命中路由规则，回退为默认能力类型',
        candidates: [],
        needConfirmation: false,
      };
    }

    return {
      capabilityType: bestType,
      capabilityName: this.typeLabel(bestType),
      reason: `启发式推断：命中 ${bestType} 类型关键词（得分 ${bestScore}）`,
      candidates: filtered
        .filter(([, s]) => s > 0)
        .map(([type, score]) => ({
          capabilityId: '',
          capabilityName: this.typeLabel(type),
          type,
          score,
          toolIds: [],
        })),
      needConfirmation: false,
    };
  }

  /** 结合 Policy 判断路由级是否需确认（验收标准 3） */
  private async checkNeedConfirmation(
    tenantId: string,
    capabilityType: string,
    toolIds: string[],
    userId?: string,
  ): Promise<boolean> {
    // 先检查路由规则自身的 needConfirmation
    // 再通过 Policy 评估
    try {
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
