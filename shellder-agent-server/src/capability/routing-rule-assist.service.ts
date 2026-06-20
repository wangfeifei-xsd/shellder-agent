import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CapabilityType } from '@prisma/client';
import { AuthUser } from '../auth/jwt.types';
import { PermissionService } from '../auth/permission.service';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingRuleAiSuggestDto } from './dto/routing-rule-ai-suggest.dto';
import { RoutingRuleAiOptimizeDto } from './dto/routing-rule-ai-optimize.dto';
import { RoutingRuleTestConditionsDto } from './dto/routing-rule-test-conditions.dto';
import {
  evaluateRoutingConditions,
  readRoutingConditions,
} from './routing-conditions.util';

const CAPABILITY_TYPE_LABEL: Record<CapabilityType, string> = {
  qa: '问答型（知识库问答）',
  query: '查询型（只读 SQL / 数据查询）',
  action: '操作型（写操作、调用接口）',
  workflow: '流程型（多步骤编排）',
};

export interface RoutingRuleAiSuggestion {
  name: string;
  description?: string;
  keywords: string[];
  patterns: string[];
  intents: string[];
  priority: number;
  needConfirmation: boolean;
  rationale: string;
  warnings?: string[];
}

export interface RoutingConditionsOptimizeResult {
  keywords: string[];
  patterns: string[];
  intents: string[];
  rationale: string;
  warnings?: string[];
  previewScore: number;
  previewHit: boolean;
  matchedKeywords: string[];
  matchedPatterns: string[];
  matchedIntents: string[];
}

export type RoutingConditionsTestResult = ReturnType<typeof evaluateRoutingConditions>;

interface LlmSuggestPayload {
  name?: string;
  description?: string;
  keywords?: unknown;
  patterns?: unknown;
  intents?: unknown;
  priority?: unknown;
  needConfirmation?: unknown;
  rationale?: string;
}

@Injectable()
export class RoutingRuleAssistService {
  private readonly logger = new Logger(RoutingRuleAssistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly permissionService: PermissionService,
  ) {}

  async suggest(
    user: AuthUser,
    dto: RoutingRuleAiSuggestDto,
  ): Promise<RoutingRuleAiSuggestion> {
    await this.assertTenantAccess(user, dto.tenantId);

    try {
      await this.llm.assertConfigured();
    } catch {
      throw new ServiceUnavailableException({
        code: 'LLM_NOT_CONFIGURED',
        message: '平台 LLM 未配置，请先在系统设置中配置模型后再使用 AI 辅助',
      });
    }

    const capability = await this.prisma.capability.findUnique({
      where: { id: dto.capabilityId },
    });
    if (!capability || capability.tenantId !== dto.tenantId) {
      throw new NotFoundException({
        code: 'CAPABILITY_NOT_FOUND',
        message: '关联能力不存在或不属于该租户',
      });
    }

    const samples = (dto.sampleQueries ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const systemPrompt = `你是 shellder-agent 平台的路由规则配置助手。
平台将用户输入与「路由规则」的 conditions 匹配，在同一关联能力下按规则得分选路。

匹配算法（供你设计 keywords / patterns / intents）：
- keywords：用户输入（小写）包含任一关键词，每个命中 +10 分
- patterns：任一正则（不区分大小写）匹配，每个命中 +20 分
- intents：用户输入包含任一意图标签子串，每个命中 +15 分（保留字段，可填英文 snake_case）

要求：
1. 仅输出一个 JSON 对象，不要 markdown 代码块或其它说明
2. keywords 用中文短语为主，8～20 个，覆盖同义表达与口语（含「咋样/怎样/怎么样/如何」等变体，「的/得」混写）
3. patterns 0～5 个，JavaScript 正则，避免过于宽泛（如 .*）；口语问法可用「考.*(咋样|怎样)」类模式
4. intents 0～5 个，可选
5. priority 建议 50～200（数值越小同能力内越优先）
6. needConfirmation：操作型/流程型涉及写操作、审批、删除时建议 true
7. name 简短（≤40 字），description 一句话说明匹配场景

JSON 字段：
name, description, keywords(string[]), patterns(string[]), intents(string[]), priority(number), needConfirmation(boolean), rationale(string)`;

    const userPrompt = [
      `关联能力类型：${CAPABILITY_TYPE_LABEL[capability.type] ?? capability.type}`,
      `能力名称：${capability.name}`,
      capability.description ? `能力说明：${capability.description}` : '',
      `配置意图：${dto.intentDescription.trim()}`,
      samples.length > 0
        ? `示例用户输入：\n${samples.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await this.llm.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const raw = this.parseJsonObject(completion.text);
    const warnings: string[] = [];
    const keywords = this.toStringArray(raw.keywords, 'keywords', warnings, 30);
    const patterns = this.filterValidPatterns(
      this.toStringArray(raw.patterns, 'patterns', warnings, 10),
      warnings,
    );
    const intents = this.toStringArray(raw.intents, 'intents', warnings, 10);

    if (keywords.length === 0 && patterns.length === 0 && intents.length === 0) {
      throw new BadRequestException({
        code: 'ROUTING_RULE_AI_EMPTY',
        message: '模型未生成有效匹配条件，请补充场景描述或示例问法后重试',
      });
    }

    const name =
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim().slice(0, 128)
        : `${capability.name}路由规则`;

    return {
      name,
      description:
        typeof raw.description === 'string' ? raw.description.trim().slice(0, 512) : undefined,
      keywords,
      patterns,
      intents,
      priority: this.clampPriority(raw.priority),
      needConfirmation: Boolean(raw.needConfirmation),
      rationale:
        typeof raw.rationale === 'string' && raw.rationale.trim()
          ? raw.rationale.trim()
          : '已根据场景描述生成匹配条件，保存前请在「路由测试」页验证。',
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /** 即时测试 conditions 与输入是否匹配（不持久化） */
  async testConditions(
    user: AuthUser,
    dto: RoutingRuleTestConditionsDto,
  ): Promise<RoutingConditionsTestResult> {
    await this.assertTenantAccess(user, dto.tenantId);
    const conditions = readRoutingConditions(dto.conditions);
    return evaluateRoutingConditions(dto.input.trim(), conditions);
  }

  /** 针对未命中样例，在现有 conditions 基础上 LLM 优化 keywords / patterns */
  async optimizeConditions(
    user: AuthUser,
    dto: RoutingRuleAiOptimizeDto,
  ): Promise<RoutingConditionsOptimizeResult> {
    await this.assertTenantAccess(user, dto.tenantId);

    try {
      await this.llm.assertConfigured();
    } catch {
      throw new ServiceUnavailableException({
        code: 'LLM_NOT_CONFIGURED',
        message: '平台 LLM 未配置，请先在系统设置中配置模型后再使用 AI 辅助',
      });
    }

    const capability = await this.prisma.capability.findUnique({
      where: { id: dto.capabilityId },
    });
    if (!capability || capability.tenantId !== dto.tenantId) {
      throw new NotFoundException({
        code: 'CAPABILITY_NOT_FOUND',
        message: '关联能力不存在或不属于该租户',
      });
    }

    const current = readRoutingConditions(dto.conditions);
    const before = evaluateRoutingConditions(dto.testInput.trim(), current);

    const systemPrompt = `你是 shellder-agent 平台的路由规则匹配条件优化助手。
用户正在编辑 routing_rule.conditions，测试输入未命中当前 keywords/patterns/intents。

匹配算法（你必须保证优化后测试输入能命中）：
- keywords：用户输入（小写）包含任一关键词子串，每个 +10 分
- patterns：任一 JavaScript 正则（i 标志）匹配，每个 +20 分
- intents：用户输入包含任一意图标签子串，每个 +15 分

优化要求：
1. 仅输出 JSON：keywords(string[]), patterns(string[]), intents(string[]), rationale(string)
2. 在保留现有有效项基础上增补，合并去重；不要删除仍能覆盖其它场景的词除非明显冗余
3. 必须让「测试输入」至少命中一项（score>0）；优先补最短子串关键词或精准正则
4. 覆盖口语：咋样/怎样/怎么样、的/得混写、公司名+人名+考得/考的等结构
5. patterns 0～5 个，避免 .* 等过宽规则
6. rationale 用中文简要说明改了什么、为何能命中`;

    const userPrompt = [
      `关联能力：${CAPABILITY_TYPE_LABEL[capability.type] ?? capability.type} / ${capability.name}`,
      dto.ruleName ? `规则名称：${dto.ruleName}` : '',
      dto.ruleDescription ? `规则说明：${dto.ruleDescription}` : '',
      `测试输入（必须命中）：${dto.testInput.trim()}`,
      `当前得分：${before.score}（未命中）`,
      before.invalidPatterns.length > 0
        ? `无效正则：${before.invalidPatterns.join('；')}`
        : '',
      `当前 keywords：${JSON.stringify(current.keywords ?? [])}`,
      `当前 patterns：${JSON.stringify(current.patterns ?? [])}`,
      `当前 intents：${JSON.stringify(current.intents ?? [])}`,
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await this.llm.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const raw = this.parseJsonObject(completion.text, 'ROUTING_RULE_AI_OPTIMIZE_PARSE_ERROR');
    const warnings: string[] = [];
    const keywords = this.toStringArray(raw.keywords, 'keywords', warnings, 40);
    const patterns = this.filterValidPatterns(
      this.toStringArray(raw.patterns, 'patterns', warnings, 10),
      warnings,
    );
    const intents = this.toStringArray(raw.intents, 'intents', warnings, 10);

    const mergedKeywords = [...new Set([...(current.keywords ?? []), ...keywords])].slice(0, 40);
    const mergedPatterns = [...new Set([...(current.patterns ?? []), ...patterns])].slice(0, 10);
    const mergedIntents = [...new Set([...(current.intents ?? []), ...intents])].slice(0, 10);

    const optimized = {
      keywords: mergedKeywords,
      patterns: mergedPatterns,
      intents: mergedIntents,
    };
    const after = evaluateRoutingConditions(dto.testInput.trim(), optimized);

    if (!after.hit) {
      warnings.push('优化后对该测试输入仍未命中，请手动调整或补充更多示例');
    }

    return {
      keywords: mergedKeywords,
      patterns: mergedPatterns,
      intents: mergedIntents,
      rationale:
        typeof raw.rationale === 'string' && raw.rationale.trim()
          ? raw.rationale.trim()
          : '已根据测试输入增补匹配条件，请再次测试确认。',
      warnings: warnings.length > 0 ? warnings : undefined,
      previewScore: after.score,
      previewHit: after.hit,
      matchedKeywords: after.matchedKeywords,
      matchedPatterns: after.matchedPatterns,
      matchedIntents: after.matchedIntents,
    };
  }

  private parseJsonObject(text: string, errorCode = 'ROUTING_RULE_AI_PARSE_ERROR'): LlmSuggestPayload {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fence?.[1] ?? trimmed).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
      this.logger.warn(`路由规则 AI 响应非 JSON: ${trimmed.slice(0, 200)}`);
      throw new BadRequestException({
        code: errorCode,
        message: '模型返回格式无效，请重试',
      });
    }
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as LlmSuggestPayload;
    } catch {
      throw new BadRequestException({
        code: errorCode,
        message: '模型返回 JSON 解析失败，请重试',
      });
    }
  }

  private toStringArray(
    value: unknown,
    field: string,
    warnings: string[],
    max: number,
  ): string[] {
    if (!Array.isArray(value)) {
      if (value !== undefined && value !== null) {
        warnings.push(`${field} 不是数组，已忽略`);
      }
      return [];
    }
    const items = value
      .filter((v): v is string => typeof v === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length < value.length) {
      warnings.push(`${field} 含非字符串项，已过滤`);
    }
    return [...new Set(items)].slice(0, max);
  }

  private filterValidPatterns(patterns: string[], warnings: string[]): string[] {
    const valid: string[] = [];
    for (const p of patterns) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(p, 'i');
        valid.push(p);
      } catch {
        warnings.push(`无效正则已忽略：${p.slice(0, 80)}`);
      }
    }
    return valid;
  }

  private clampPriority(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 100;
    return Math.min(10000, Math.max(1, Math.round(n)));
  }

  private async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的路由规则管理权限',
      });
    }
  }
}
