import { Injectable, Logger } from '@nestjs/common';
import { CapabilityType } from '@prisma/client';
import { applicationProperties } from '@shellder/config';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { PROMPT_KEYS } from '../prompt/prompt-keys';
import { PromptResolverService } from '../prompt/prompt-resolver.service';

export interface RoutingLlmClassifyResult {
  capabilityType: CapabilityType;
  confidence: number;
  reason: string;
}

/**
 * Stage1 可选 LLM 能力分类（feature flag 默认关）。
 * Prompt key：routing.classify.system
 */
@Injectable()
export class RoutingLlmClassifyService {
  private readonly logger = new Logger(RoutingLlmClassifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly promptResolver: PromptResolverService,
  ) {}

  async isEnabled(tenantId: string): Promise<boolean> {
    if (applicationProperties.get().app.routing.llmClassifyEnabled) {
      return true;
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const config = tenant?.config as { routing?: { llmClassifyEnabled?: boolean } } | null;
    return config?.routing?.llmClassifyEnabled === true;
  }

  async classify(
    tenantId: string,
    input: string,
    allowedTypes: string[],
  ): Promise<RoutingLlmClassifyResult | null> {
    if (!(await this.isEnabled(tenantId))) {
      return null;
    }

    try {
      await this.llm.assertConfigured();
      const rendered = await this.promptResolver.render({
        promptKey: PROMPT_KEYS.ROUTING_CLASSIFY_SYSTEM,
        tenantId,
        variables: {
          userMessage: input,
          allowedCapabilities: allowedTypes.join(', '),
        },
      });

      const completion = await this.llm.chatCompletion([
        { role: 'system', content: rendered.content },
        { role: 'user', content: input },
      ]);

      const parsed = this.parseResponse(completion.text, allowedTypes);
      if (!parsed) {
        this.logger.warn('LLM 路由分类响应无法解析');
        return null;
      }
      return parsed;
    } catch (err) {
      this.logger.warn(`LLM 路由分类失败：${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private parseResponse(
    raw: string,
    allowedTypes: string[],
  ): RoutingLlmClassifyResult | null {
    const text = raw.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return null;
    }

    const capabilityType = data.capabilityType;
    if (typeof capabilityType !== 'string' || !allowedTypes.includes(capabilityType)) {
      return null;
    }

    const confidenceRaw = data.confidence;
    const confidence =
      typeof confidenceRaw === 'number' && !Number.isNaN(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0.6;

    const reason =
      typeof data.reason === 'string' && data.reason.trim()
        ? data.reason.trim()
        : 'LLM 分类结果';

    return {
      capabilityType: capabilityType as CapabilityType,
      confidence,
      reason,
    };
  }
}
