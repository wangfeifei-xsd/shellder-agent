import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../../auth/password.util';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userInclude = {
  roles: { include: { role: true } },
  tenants: { include: { tenant: true } },
} satisfies Prisma.UserInclude;

type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    await this.ensureUsernameAvailable(dto.username);
    await this.validateRoleIds(dto.roleIds);
    await this.validateTenantIds(dto.tenantIds);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash: hashPassword(dto.password),
        displayName: dto.displayName ?? null,
        email: dto.email ?? null,
        status: dto.status ?? UserStatus.enabled,
        remark: dto.remark ?? null,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
        tenants: dto.tenantIds?.length
          ? { create: dto.tenantIds.map((tenantId) => ({ tenantId })) }
          : undefined,
      },
      include: userInclude,
    });

    return this.toView(user);
  }

  async findMany(query: QueryUserDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.UserWhereInput = {};
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword } },
        { displayName: { contains: query.keyword } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.tenantId) where.tenants = { some: { tenantId: query.tenantId } };
    if (query.roleId) where.roles = { some: { roleId: query.roleId } };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: userInclude,
      }),
    ]);

    return {
      items: rows.map((u) => this.toView(u)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const user = await this.getOrThrow(id);
    return this.toView(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.getOrThrow(id);
    await this.validateRoleIds(dto.roleIds);
    await this.validateTenantIds(dto.tenantIds);

    const data: Prisma.UserUpdateInput = {};
    if (dto.password) data.passwordHash = hashPassword(dto.password);
    if (dto.displayName !== undefined) data.displayName = dto.displayName || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.remark !== undefined) data.remark = dto.remark || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });

      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (dto.roleIds.length) {
          await tx.userRole.createMany({
            data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
      }

      if (dto.tenantIds) {
        await tx.userTenant.deleteMany({ where: { userId: id } });
        if (dto.tenantIds.length) {
          await tx.userTenant.createMany({
            data: dto.tenantIds.map((tenantId) => ({ userId: id, tenantId })),
          });
        }
      }
    });

    void existing;
    return this.findOne(id);
  }

  async updateStatus(id: string, status: UserStatus) {
    const existing = await this.getOrThrow(id);
    if (existing.isSystem && status === UserStatus.disabled) {
      throw new BadRequestException({
        code: 'SYSTEM_USER_PROTECTED',
        message: '系统内置管理员不可禁用',
      });
    }
    await this.prisma.user.update({ where: { id }, data: { status } });
    return this.findOne(id);
  }

  async remove(id: string) {
    const existing = await this.getOrThrow(id);
    if (existing.isSystem) {
      throw new BadRequestException({
        code: 'SYSTEM_USER_PROTECTED',
        message: '系统内置管理员不可删除',
      });
    }
    await this.prisma.user.delete({ where: { id } });
    return { id };
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private async ensureUsernameAvailable(username: string) {
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) {
      throw new ConflictException({
        code: 'USERNAME_CONFLICT',
        message: `用户名已存在：${username}`,
      });
    }
  }

  private async validateRoleIds(roleIds?: string[]) {
    if (!roleIds?.length) return;
    const count = await this.prisma.role.count({
      where: { id: { in: roleIds } },
    });
    if (count !== roleIds.length) {
      throw new BadRequestException({
        code: 'ROLE_NOT_FOUND',
        message: '存在无效的角色 ID',
      });
    }
  }

  /** 仅允许绑定存在且启用的租户（实施规格 §1.4） */
  private async validateTenantIds(tenantIds?: string[]) {
    if (!tenantIds?.length) return;
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, status: true },
    });
    if (tenants.length !== tenantIds.length) {
      throw new BadRequestException({
        code: 'TENANT_NOT_FOUND',
        message: '存在未在租户表登记的 tenant.id',
      });
    }
    const disabled = tenants.find((t) => t.status === TenantStatus.disabled);
    if (disabled) {
      throw new BadRequestException({
        code: 'TENANT_DISABLED',
        message: `不可绑定已禁用租户：${disabled.id}`,
      });
    }
  }

  private async getOrThrow(id: string): Promise<UserWithRelations> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `用户不存在：${id}`,
      });
    }
    return user;
  }

  private toView(user: UserWithRelations) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      isSystem: user.isSystem,
      remark: user.remark,
      roles: user.roles.map((r) => ({
        id: r.role.id,
        code: r.role.code,
        name: r.role.name,
      })),
      tenants: user.tenants.map((t) => ({
        id: t.tenant.id,
        code: t.tenant.code,
        name: t.tenant.name,
        status: t.tenant.status,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
