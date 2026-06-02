import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePromptBindingDto,
  QueryPromptBindingDto,
  UpdatePromptBindingDto,
} from './dto/prompt-binding.dto';
import { promptBindingNotFound } from './prompt.errors';

@Injectable()
export class PromptBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: QueryPromptBindingDto) {
    const where: Prisma.PromptBindingWhereInput = {};
    if (query.tenantId !== undefined) where.tenantId = query.tenantId || null;
    if (query.bindType) where.bindType = query.bindType;
    if (query.bindId) where.bindId = query.bindId;
    if (query.promptKey) where.promptKey = query.promptKey;

    const items = await this.prisma.promptBinding.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return { items };
  }

  async create(dto: CreatePromptBindingDto) {
    return this.prisma.promptBinding.create({
      data: {
        tenantId: dto.tenantId ?? null,
        bindType: dto.bindType,
        bindId: dto.bindId ?? null,
        promptKey: dto.promptKey,
        priority: dto.priority ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdatePromptBindingDto) {
    await this.getOrThrow(id);
    return this.prisma.promptBinding.update({
      where: { id },
      data: {
        promptKey: dto.promptKey,
        priority: dto.priority,
      },
    });
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.prisma.promptBinding.delete({ where: { id } });
    return { ok: true };
  }

  private async getOrThrow(id: string) {
    const row = await this.prisma.promptBinding.findUnique({ where: { id } });
    if (!row) throw promptBindingNotFound();
    return row;
  }
}
