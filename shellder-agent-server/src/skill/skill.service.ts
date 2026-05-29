import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Skill } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { QuerySkillDto } from './dto/query-skill.dto';
import { SkillTestDto } from './dto/skill-test.dto';
import { QueryExecutionDto } from './dto/query-execution.dto';

@Injectable()
export class SkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  // ── 技能书 CRUD ──────────────────────────────────────────

  async create(user: AuthUser, dto: CreateSkillDto) {
    await this.assertTenantAccess(user, dto.tenantId);
    await this.assertTenantEnabled(dto.tenantId);

    if (dto.entryMode === 'tool' && !dto.entryToolId) {
      throw new BadRequestException({
        code: 'ENTRY_TOOL_REQUIRED',
        message: '入口模式为 tool 时必须指定 entryToolId',
      });
    }
    if (dto.entryMode === 'workflow' && !dto.workflowToolId) {
      throw new BadRequestException({
        code: 'WORKFLOW_TOOL_REQUIRED',
        message: '入口模式为 workflow 时必须指定 workflowToolId',
      });
    }

    if (dto.entryToolId) {
      await this.assertToolExists(dto.entryToolId, dto.tenantId);
    }
    if (dto.workflowToolId) {
      await this.assertToolExists(dto.workflowToolId, dto.tenantId);
    }

    try {
      return await this.prisma.skill.create({
        data: {
          tenantId: dto.tenantId,
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          category: dto.category ?? null,
          capabilityType: dto.capabilityType,
          status: dto.status ?? 'draft',
          riskLevel: dto.riskLevel ?? 'low',
          needConfirmation: dto.needConfirmation ?? false,
          permissionScope: dto.permissionScope ?? null,
          entryMode: dto.entryMode,
          entryToolId: dto.entryToolId ?? null,
          workflowToolId: dto.workflowToolId ?? null,
          inputSchema: dto.inputSchema ?? Prisma.JsonNull,
          outputSchema: dto.outputSchema ?? Prisma.JsonNull,
          preconditions: dto.preconditions ?? Prisma.JsonNull,
          resultTemplate: dto.resultTemplate ?? null,
          missingParamStrategy: dto.missingParamStrategy ?? Prisma.JsonNull,
          failureHint: dto.failureHint ?? null,
          remark: dto.remark ?? null,
          triggers: dto.triggers?.length
            ? {
                create: dto.triggers.map((t) => ({
                  triggerText: t.triggerText,
                  triggerType: t.triggerType ?? 'keyword',
                  priority: t.priority ?? 100,
                })),
              }
            : undefined,
          bindings: dto.bindings?.length
            ? {
                create: dto.bindings.map((b) => ({
                  bindingType: b.bindingType,
                  targetId: b.targetId,
                  orderNo: b.orderNo ?? 0,
                  config: b.config ?? Prisma.JsonNull,
                })),
              }
            : undefined,
        },
        include: { triggers: true, bindings: true },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async findMany(user: AuthUser, query: QuerySkillDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SkillWhereInput = {
      tenantId: await this.resolveTenantFilter(user, query.tenantId),
    };
    if (query.capabilityType) where.capabilityType = query.capabilityType as Skill['capabilityType'];
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status as Skill['status'];
    if (query.riskLevel) where.riskLevel = query.riskLevel as Skill['riskLevel'];
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { code: { contains: query.keyword } },
        { description: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.skill.count({ where }),
      this.prisma.skill.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          triggers: true,
          bindings: true,
        },
      }),
    ]);

    const skillIds = rows.map((r) => r.id);
    const lastCallMap = await this.getLastCallTimes(skillIds);

    const items = rows.map((r) => ({
      ...r,
      lastCalledAt: lastCallMap.get(r.id) ?? null,
    }));

    return { items, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const skill = await this.getOrThrow(id);
    await this.assertTenantAccess(user, skill.tenantId);

    const fullSkill = await this.prisma.skill.findUnique({
      where: { id },
      include: { triggers: true, bindings: true },
    });

    const stats = await this.getSkillStats(id);
    const recentExecs = await this.prisma.skillExecutionLog.findMany({
      where: { skillId: id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    let entryTool = null;
    let workflowTool = null;
    if (fullSkill!.entryToolId) {
      entryTool = await this.prisma.tool.findUnique({
        where: { id: fullSkill!.entryToolId },
        select: { id: true, name: true, type: true, status: true },
      });
    }
    if (fullSkill!.workflowToolId) {
      workflowTool = await this.prisma.tool.findUnique({
        where: { id: fullSkill!.workflowToolId },
        select: { id: true, name: true, type: true, status: true },
      });
    }

    return {
      ...fullSkill,
      entryTool,
      workflowTool,
      stats,
      recentExecutions: recentExecs,
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateSkillDto) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);

    const entryMode = dto.entryMode ?? existing.entryMode;
    if (entryMode === 'tool' && dto.entryToolId !== undefined && !dto.entryToolId) {
      throw new BadRequestException({
        code: 'ENTRY_TOOL_REQUIRED',
        message: '入口模式为 tool 时必须指定 entryToolId',
      });
    }

    if (dto.entryToolId) {
      await this.assertToolExists(dto.entryToolId, existing.tenantId);
    }
    if (dto.workflowToolId) {
      await this.assertToolExists(dto.workflowToolId, existing.tenantId);
    }

    const data: Prisma.SkillUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.category !== undefined) data.category = dto.category || null;
    if (dto.capabilityType !== undefined) data.capabilityType = dto.capabilityType;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.riskLevel !== undefined) data.riskLevel = dto.riskLevel;
    if (dto.needConfirmation !== undefined) data.needConfirmation = dto.needConfirmation;
    if (dto.permissionScope !== undefined) data.permissionScope = dto.permissionScope || null;
    if (dto.entryMode !== undefined) data.entryMode = dto.entryMode;
    if (dto.entryToolId !== undefined) data.entryToolId = dto.entryToolId || null;
    if (dto.workflowToolId !== undefined) data.workflowToolId = dto.workflowToolId || null;
    if (dto.inputSchema !== undefined) data.inputSchema = dto.inputSchema ?? Prisma.JsonNull;
    if (dto.outputSchema !== undefined) data.outputSchema = dto.outputSchema ?? Prisma.JsonNull;
    if (dto.preconditions !== undefined) data.preconditions = dto.preconditions ?? Prisma.JsonNull;
    if (dto.resultTemplate !== undefined) data.resultTemplate = dto.resultTemplate || null;
    if (dto.missingParamStrategy !== undefined) data.missingParamStrategy = dto.missingParamStrategy ?? Prisma.JsonNull;
    if (dto.failureHint !== undefined) data.failureHint = dto.failureHint || null;
    if (dto.remark !== undefined) data.remark = dto.remark || null;

    const ops: Prisma.PrismaPromise<unknown>[] = [];

    if (dto.triggers !== undefined) {
      ops.push(this.prisma.skillTrigger.deleteMany({ where: { skillId: id } }));
    }
    if (dto.bindings !== undefined) {
      ops.push(this.prisma.skillBinding.deleteMany({ where: { skillId: id } }));
    }

    if (ops.length > 0) {
      await this.prisma.$transaction(ops);
    }

    try {
      return await this.prisma.skill.update({
        where: { id },
        data: {
          ...data,
          version: { increment: 1 },
          ...(dto.triggers !== undefined
            ? {
                triggers: {
                  create: (dto.triggers ?? []).map((t) => ({
                    triggerText: t.triggerText,
                    triggerType: t.triggerType ?? 'keyword',
                    priority: t.priority ?? 100,
                  })),
                },
              }
            : {}),
          ...(dto.bindings !== undefined
            ? {
                bindings: {
                  create: (dto.bindings ?? []).map((b) => ({
                    bindingType: b.bindingType,
                    targetId: b.targetId,
                    orderNo: b.orderNo ?? 0,
                    config: b.config ?? Prisma.JsonNull,
                  })),
                },
              }
            : {}),
        },
        include: { triggers: true, bindings: true },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async updateStatus(user: AuthUser, id: string, status: Skill['status']) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    return this.prisma.skill.update({
      where: { id },
      data: { status },
    });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.getOrThrow(id);
    await this.assertTenantAccess(user, existing.tenantId);
    await this.prisma.skill.delete({ where: { id } });
    return { id };
  }

  // ── 触发测试 ─────────────────────────────────────────────

  async testTrigger(user: AuthUser, dto: SkillTestDto) {
    await this.assertTenantAccess(user, dto.tenantId);

    const where: Prisma.SkillWhereInput = {
      tenantId: dto.tenantId,
      status: 'enabled',
    };
    if (dto.capabilityType) {
      where.capabilityType = dto.capabilityType as Skill['capabilityType'];
    }

    const skills = await this.prisma.skill.findMany({
      where,
      include: { triggers: { orderBy: { priority: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    const inputText = dto.text.toLowerCase();
    const candidates: {
      skill: typeof skills[number];
      matchedTrigger: typeof skills[number]['triggers'][number] | null;
      score: number;
      reason: string;
    }[] = [];

    for (const skill of skills) {
      let bestScore = 0;
      let bestTrigger: typeof skill.triggers[number] | null = null;
      let reason = '';

      for (const trigger of skill.triggers) {
        const triggerLower = trigger.triggerText.toLowerCase();

        if (trigger.triggerType === 'regex') {
          try {
            const re = new RegExp(trigger.triggerText, 'i');
            if (re.test(dto.text)) {
              const score = 90 + (100 - trigger.priority) / 100;
              if (score > bestScore) {
                bestScore = score;
                bestTrigger = trigger;
                reason = `正则匹配：${trigger.triggerText}`;
              }
            }
          } catch {
            // skip invalid regex
          }
        } else if (trigger.triggerType === 'intent') {
          if (inputText.includes(triggerLower) || triggerLower.includes(inputText)) {
            const score = 70 + (100 - trigger.priority) / 100;
            if (score > bestScore) {
              bestScore = score;
              bestTrigger = trigger;
              reason = `意图匹配：${trigger.triggerText}`;
            }
          }
        } else {
          if (inputText.includes(triggerLower)) {
            const score = 80 + (100 - trigger.priority) / 100;
            if (score > bestScore) {
              bestScore = score;
              bestTrigger = trigger;
              reason = `关键词匹配：${trigger.triggerText}`;
            }
          }
        }
      }

      if (bestScore > 0) {
        candidates.push({ skill, matchedTrigger: bestTrigger, score: bestScore, reason });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const hit = candidates[0] ?? null;

    let entryTool = null;
    if (hit) {
      const toolId = hit.skill.entryMode === 'workflow'
        ? hit.skill.workflowToolId
        : hit.skill.entryToolId;
      if (toolId) {
        entryTool = await this.prisma.tool.findUnique({
          where: { id: toolId },
          select: { id: true, name: true, type: true, status: true },
        });
      }
    }

    return {
      inputText: dto.text,
      capabilityTypeFilter: dto.capabilityType ?? null,
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 10).map((c) => ({
        skillId: c.skill.id,
        skillName: c.skill.name,
        skillCode: c.skill.code,
        capabilityType: c.skill.capabilityType,
        score: c.score,
        reason: c.reason,
        matchedTrigger: c.matchedTrigger
          ? { text: c.matchedTrigger.triggerText, type: c.matchedTrigger.triggerType }
          : null,
      })),
      hitSkill: hit
        ? {
            id: hit.skill.id,
            name: hit.skill.name,
            code: hit.skill.code,
            capabilityType: hit.skill.capabilityType,
            entryMode: hit.skill.entryMode,
            reason: hit.reason,
          }
        : null,
      entryTool,
    };
  }

  // ── 调用记录 ─────────────────────────────────────────────

  async getExecutions(user: AuthUser, skillId: string, query: QueryExecutionDto) {
    const skill = await this.getOrThrow(skillId);
    await this.assertTenantAccess(user, skill.tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SkillExecutionLogWhereInput = { skillId };
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status as 'success' | 'failed' | 'running' | 'timeout';
    if (query.startFrom || query.startTo) {
      where.startedAt = {};
      if (query.startFrom) (where.startedAt as Prisma.DateTimeFilter).gte = new Date(query.startFrom);
      if (query.startTo) (where.startedAt as Prisma.DateTimeFilter).lte = new Date(query.startTo);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.skillExecutionLog.count({ where }),
      this.prisma.skillExecutionLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows, total, page, pageSize };
  }

  // ── 供外部模块调用 ───────────────────────────────────────

  async getEnabledByTenant(tenantId: string) {
    return this.prisma.skill.findMany({
      where: { tenantId, status: 'enabled' },
      include: { triggers: { orderBy: { priority: 'asc' } }, bindings: { orderBy: { orderNo: 'asc' } } },
    });
  }

  // ── 内部辅助 ─────────────────────────────────────────────

  private async getOrThrow(id: string): Promise<Skill> {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) {
      throw new NotFoundException({ code: 'SKILL_NOT_FOUND', message: `技能书不存在：${id}` });
    }
    return skill;
  }

  private async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({ code: 'TENANT_FORBIDDEN', message: '无该租户的技能书访问权限' });
    }
  }

  private async assertTenantEnabled(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: `租户不存在：${tenantId}` });
    }
    if (tenant.status === 'disabled') {
      throw new ForbiddenException({ code: 'TENANT_DISABLED', message: '该租户已禁用，不可新建技能书' });
    }
  }

  private async assertToolExists(toolId: string, tenantId: string) {
    const tool = await this.prisma.tool.findUnique({ where: { id: toolId } });
    if (!tool) {
      throw new NotFoundException({ code: 'TOOL_NOT_FOUND', message: `关联工具不存在：${toolId}` });
    }
    if (tool.tenantId !== tenantId) {
      throw new BadRequestException({ code: 'TOOL_TENANT_MISMATCH', message: '关联工具不属于该租户' });
    }
  }

  private async resolveTenantFilter(
    user: AuthUser,
    requestedTenantId?: string,
  ): Promise<string | Prisma.StringFilter | undefined> {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) {
      return requestedTenantId || undefined;
    }
    const allowed = user.tenantIds ?? [];
    if (requestedTenantId && allowed.includes(requestedTenantId)) {
      return requestedTenantId;
    }
    return { in: allowed };
  }

  private async getLastCallTimes(skillIds: string[]): Promise<Map<string, Date>> {
    if (skillIds.length === 0) return new Map();

    const logs = await this.prisma.skillExecutionLog.groupBy({
      by: ['skillId'],
      where: { skillId: { in: skillIds } },
      _max: { startedAt: true },
    });

    const map = new Map<string, Date>();
    for (const log of logs) {
      if (log._max.startedAt) {
        map.set(log.skillId, log._max.startedAt);
      }
    }
    return map;
  }

  private async getSkillStats(skillId: string) {
    const logs = await this.prisma.skillExecutionLog.findMany({
      where: { skillId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: { status: true, startedAt: true, finishedAt: true },
    });

    const sampleSize = logs.length;
    if (sampleSize === 0) {
      return { sampleSize: 0, successRate: 0, failureRate: 0, avgDurationMs: null };
    }

    const successCount = logs.filter((l) => l.status === 'success').length;
    const failedCount = logs.filter((l) => l.status === 'failed').length;

    const durations = logs
      .filter((l) => l.finishedAt && l.startedAt)
      .map((l) => l.finishedAt!.getTime() - l.startedAt.getTime())
      .filter((d) => d >= 0);

    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    return {
      sampleSize,
      successRate: sampleSize > 0 ? successCount / sampleSize : 0,
      failureRate: sampleSize > 0 ? failedCount / sampleSize : 0,
      avgDurationMs,
    };
  }

  private mapUniqueError(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new BadRequestException({
        code: 'SKILL_CODE_DUPLICATED',
        message: '同租户下已存在同编码技能书',
      });
    }
    return err;
  }
}
