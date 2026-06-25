import { Injectable } from '@nestjs/common';
import { PromptScope, PromptVersionState } from '@prisma/client';
import { applicationProperties } from '@shellder/config';
import { PrismaService } from '../prisma/prisma.service';
import { promptTemplateNotFound, promptVariableMissing } from './prompt.errors';
import {
  renderMustache,
  resolveRequiredVariables,
} from './prompt-render.util';

export interface RenderPromptInput {
  promptKey: string;
  tenantId?: string;
  channel?: 'published' | 'draft';
  variables?: Record<string, unknown>;
}

export interface RenderPromptResult {
  content: string;
  templateId: string;
  versionId: string;
  version: number;
}

interface CacheEntry {
  result: RenderPromptResult;
  rawContent: string;
  variableSchema: unknown;
  expiresAt: number;
}

@Injectable()
export class PromptResolverService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async render(input: RenderPromptInput): Promise<RenderPromptResult> {
    const channel = input.channel ?? 'published';
    const variables = input.variables ?? {};

    if (channel === 'published') {
      const cacheKey = this.cacheKey(input.promptKey, input.tenantId);
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.assertVariables(cached.rawContent, cached.variableSchema, variables);
        return {
          ...cached.result,
          content: renderMustache(cached.rawContent, variables),
        };
      }
    }

    const template = await this.resolveTemplate(input.promptKey, input.tenantId);
    if (!template) throw promptTemplateNotFound();

    const version = await this.prisma.promptVersion.findFirst({
      where: {
        templateId: template.id,
        state:
          channel === 'published'
            ? PromptVersionState.published
            : PromptVersionState.draft,
      },
      orderBy: { version: 'desc' },
    });

    if (!version) {
      if (channel === 'draft') {
        const published = await this.prisma.promptVersion.findFirst({
          where: {
            templateId: template.id,
            state: PromptVersionState.published,
          },
        });
        if (!published) throw promptTemplateNotFound();
        this.assertVariables(
          published.content,
          template.variableSchema,
          variables,
        );
        const result: RenderPromptResult = {
          content: renderMustache(published.content, variables),
          templateId: template.id,
          versionId: published.id,
          version: published.version,
        };
        return result;
      }
      throw promptTemplateNotFound();
    }

    this.assertVariables(version.content, template.variableSchema, variables);

    const result: RenderPromptResult = {
      content: renderMustache(version.content, variables),
      templateId: template.id,
      versionId: version.id,
      version: version.version,
    };

    if (channel === 'published') {
      const cacheKey = this.cacheKey(input.promptKey, input.tenantId);
      this.cache.set(cacheKey, {
        result: {
          content: version.content,
          templateId: result.templateId,
          versionId: result.versionId,
          version: result.version,
        },
        rawContent: version.content,
        variableSchema: template.variableSchema,
        expiresAt: Date.now() + applicationProperties.get().app.prompt.cacheTtlMs,
      });
      return {
        ...result,
        content: renderMustache(version.content, variables),
      };
    }

    return result;
  }

  invalidate(promptKey: string, tenantId?: string) {
    this.cache.delete(this.cacheKey(promptKey, tenantId));
    this.cache.delete(this.cacheKey(promptKey, undefined));
  }

  private cacheKey(promptKey: string, tenantId?: string) {
    return `${promptKey}::${tenantId ?? 'global'}`;
  }

  private async resolveTemplate(promptKey: string, tenantId?: string) {
    if (tenantId) {
      const tenantTpl = await this.prisma.promptTemplate.findFirst({
        where: {
          promptKey,
          scope: PromptScope.tenant,
          tenantId,
          status: 'active',
        },
      });
      if (tenantTpl) return tenantTpl;
    }
    return this.prisma.promptTemplate.findFirst({
      where: {
        promptKey,
        scope: PromptScope.global,
        tenantId: null,
        status: 'active',
      },
    });
  }

  private assertVariables(
    content: string,
    variableSchema: unknown,
    variables: Record<string, unknown>,
  ) {
    const required = resolveRequiredVariables(content, variableSchema);
    const missing = required.filter((k) => {
      const v = variables[k];
      return v === undefined || v === null;
    });
    if (missing.length > 0) {
      throw promptVariableMissing(missing);
    }
  }
}
