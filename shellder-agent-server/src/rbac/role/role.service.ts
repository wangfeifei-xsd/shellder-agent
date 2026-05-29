import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { readRolePolicy } from '../../auth/permission.service';
import { RolePolicy } from '../../auth/permissions';
import { CreateRoleDto } from './dto/create-role.dto';
import { QueryRoleDto } from './dto/query-role.dto';
import { RolePolicyDto } from './dto/role-policy.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    await this.ensureCodeAvailable(dto.code);

    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        menus: (dto.menus ?? []) as unknown as Prisma.InputJsonValue,
        modules: (dto.modules ?? []) as unknown as Prisma.InputJsonValue,
        toolScopes: (dto.toolScopes ?? []) as unknown as Prisma.InputJsonValue,
        policy: this.normalizePolicy(dto.policy) as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toView(role);
  }

  async findMany(query: QueryRoleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.RoleWhereInput = {};
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { code: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { users: true } } },
      }),
    ]);

    return {
      items: rows.map((r) => ({ ...this.toView(r), userCount: r._count.users })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const role = await this.getOrThrow(id);
    return this.toView(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const existing = await this.getOrThrow(id);

    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.menus !== undefined) {
      data.menus = dto.menus as unknown as Prisma.InputJsonValue;
    }
    if (dto.modules !== undefined) {
      data.modules = dto.modules as unknown as Prisma.InputJsonValue;
    }
    if (dto.toolScopes !== undefined) {
      data.toolScopes = dto.toolScopes as unknown as Prisma.InputJsonValue;
    }
    if (dto.policy !== undefined) {
      const merged: RolePolicy = {
        ...readRolePolicy(existing),
        ...this.stripUndefined(this.normalizePolicy(dto.policy)),
      };
      data.policy = merged as unknown as Prisma.InputJsonValue;
    }

    const role = await this.prisma.role.update({ where: { id }, data });
    return this.toView(role);
  }

  async remove(id: string) {
    const role = await this.getOrThrow(id);
    if (role.isSystem) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_PROTECTED',
        message: '系统内置角色不可删除',
      });
    }
    const userCount = await this.prisma.userRole.count({ where: { roleId: id } });
    if (userCount > 0) {
      throw new BadRequestException({
        code: 'ROLE_IN_USE',
        message: `角色已分配给 ${userCount} 个用户，无法删除`,
      });
    }
    await this.prisma.role.delete({ where: { id } });
    return { id };
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private async ensureCodeAvailable(code: string) {
    const exists = await this.prisma.role.findUnique({ where: { code } });
    if (exists) {
      throw new ConflictException({
        code: 'ROLE_CODE_CONFLICT',
        message: `角色编码已存在：${code}`,
      });
    }
  }

  private async getOrThrow(id: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `角色不存在：${id}`,
      });
    }
    return role;
  }

  private normalizePolicy(policy?: RolePolicyDto): RolePolicy {
    return {
      capabilities: policy?.capabilities ?? [],
      canApproveHighRisk: policy?.canApproveHighRisk ?? false,
    };
  }

  private stripUndefined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
  }

  private toView(role: Role) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      menus: (role.menus ?? []) as string[],
      modules: (role.modules ?? []) as string[],
      toolScopes: (role.toolScopes ?? []) as string[],
      policy: readRolePolicy(role),
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
