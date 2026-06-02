import { Injectable } from '@nestjs/common';
import { PromptVersionState } from '@prisma/client';
import { AuthUser } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePromptVersionDto } from './dto/update-prompt-version.dto';
import {
  promptVersionNotDraft,
  promptVersionNotFound,
} from './prompt.errors';
import { PromptResolverService } from './prompt-resolver.service';
import { PromptTemplateService } from './prompt-template.service';
import { sha256Content } from './prompt-render.util';

@Injectable()
export class PromptVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: PromptTemplateService,
    private readonly resolver: PromptResolverService,
  ) {}

  async listVersions(user: AuthUser, templateId: string) {
    const template = await this.templateService.getTemplateOrThrow(templateId);
    await this.templateService.assertTemplateAccess(user, template);
    const versions = await this.prisma.promptVersion.findMany({
      where: { templateId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        state: true,
        content: true,
        changelog: true,
        contentHash: true,
        publishedAt: true,
        publishedBy: true,
        createdAt: true,
      },
    });
    return { templateId, items: versions };
  }

  async createDraftFromPublished(user: AuthUser, templateId: string) {
    const template = await this.templateService.getTemplateOrThrow(templateId);
    await this.templateService.assertTemplateAccess(user, template);

    const existingDraft = await this.prisma.promptVersion.findFirst({
      where: { templateId, state: PromptVersionState.draft },
    });
    if (existingDraft) {
      return this.toVersionView(existingDraft);
    }

    const published = await this.prisma.promptVersion.findFirst({
      where: { templateId, state: PromptVersionState.published },
      orderBy: { version: 'desc' },
    });
    if (!published) {
      throw promptVersionNotFound();
    }

    const maxVer = await this.prisma.promptVersion.aggregate({
      where: { templateId },
      _max: { version: true },
    });
    const nextVersion = (maxVer._max.version ?? 0) + 1;

    const draft = await this.prisma.promptVersion.create({
      data: {
        templateId,
        version: nextVersion,
        content: published.content,
        contentHash: published.contentHash,
        changelog: `自 v${published.version} 复制`,
        state: PromptVersionState.draft,
      },
    });
    return this.toVersionView(draft);
  }

  async updateDraft(versionId: string, dto: UpdatePromptVersionDto) {
    const version = await this.getVersionOrThrow(versionId);
    if (version.state !== PromptVersionState.draft) {
      throw promptVersionNotDraft();
    }
    const content = dto.content ?? version.content;
    const updated = await this.prisma.promptVersion.update({
      where: { id: versionId },
      data: {
        content: dto.content,
        contentHash: dto.content ? sha256Content(content) : undefined,
        changelog: dto.changelog,
      },
    });
    return this.toVersionView(updated);
  }

  async publish(user: AuthUser, versionId: string) {
    const version = await this.getVersionOrThrow(versionId);
    if (version.state !== PromptVersionState.draft) {
      throw promptVersionNotDraft();
    }

    const template = await this.templateService.getTemplateOrThrow(version.templateId);

    await this.prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: {
          templateId: version.templateId,
          state: PromptVersionState.published,
        },
        data: { state: PromptVersionState.deprecated },
      });
      await tx.promptVersion.update({
        where: { id: versionId },
        data: {
          state: PromptVersionState.published,
          publishedAt: new Date(),
          publishedBy: user.id,
        },
      });
    });

    this.resolver.invalidate(template.promptKey, template.tenantId ?? undefined);

    return this.toVersionView(
      await this.getVersionOrThrow(versionId),
    );
  }

  async rollback(user: AuthUser, versionId: string) {
    const version = await this.getVersionOrThrow(versionId);
    if (version.state === PromptVersionState.draft) {
      throw promptVersionNotDraft();
    }

    const template = await this.templateService.getTemplateOrThrow(version.templateId);

    await this.prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: {
          templateId: version.templateId,
          state: PromptVersionState.published,
        },
        data: { state: PromptVersionState.deprecated },
      });
      await tx.promptVersion.update({
        where: { id: versionId },
        data: {
          state: PromptVersionState.published,
          publishedAt: new Date(),
          publishedBy: user.id,
        },
      });
    });

    this.resolver.invalidate(template.promptKey, template.tenantId ?? undefined);

    return this.toVersionView(await this.getVersionOrThrow(versionId));
  }

  async getVersionOrThrow(versionId: string) {
    const version = await this.prisma.promptVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw promptVersionNotFound();
    return version;
  }

  private toVersionView(v: {
    id: string;
    templateId: string;
    version: number;
    state: PromptVersionState;
    changelog: string | null;
    contentHash: string;
    publishedAt: Date | null;
    publishedBy: string | null;
    createdAt: Date;
    content?: string;
  }) {
    return {
      id: v.id,
      templateId: v.templateId,
      version: v.version,
      state: v.state,
      changelog: v.changelog,
      contentHash: v.contentHash,
      publishedAt: v.publishedAt,
      publishedBy: v.publishedBy,
      createdAt: v.createdAt,
      ...(v.content !== undefined ? { content: v.content } : {}),
    };
  }

  async getVersionDetail(user: AuthUser, versionId: string) {
    const version = await this.getVersionOrThrow(versionId);
    const template = await this.templateService.getTemplateOrThrow(version.templateId);
    await this.templateService.assertTemplateAccess(user, template);
    return this.toVersionView(version);
  }
}
