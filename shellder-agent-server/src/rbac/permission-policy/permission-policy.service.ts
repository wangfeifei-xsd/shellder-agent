import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { readRolePolicy } from '../../auth/permission.service';
import { RolePolicy } from '../../auth/permissions';
import { UpdatePermissionPolicyDto } from './dto/update-policy.dto';

/** 权限策略：按角色维度维护能力访问与高风险审批权限（执行计划 §3.3） */
@Injectable()
export class PermissionPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { items: roles.map((r) => this.toView(r)) };
  }

  async findByRole(roleId: string) {
    const role = await this.getOrThrow(roleId);
    return this.toView(role);
  }

  async update(roleId: string, dto: UpdatePermissionPolicyDto) {
    const role = await this.getOrThrow(roleId);
    const current = readRolePolicy(role);
    const next: RolePolicy = {
      capabilities: dto.capabilities ?? current.capabilities,
      canApproveHighRisk: dto.canApproveHighRisk ?? current.canApproveHighRisk,
    };
    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: { policy: next as unknown as Prisma.InputJsonValue },
    });
    return this.toView(updated);
  }

  private async getOrThrow(roleId: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `角色不存在：${roleId}`,
      });
    }
    return role;
  }

  private toView(role: Role) {
    const policy = readRolePolicy(role);
    return {
      roleId: role.id,
      roleCode: role.code,
      roleName: role.name,
      isSystem: role.isSystem,
      capabilities: policy.capabilities,
      canApproveHighRisk: policy.canApproveHighRisk,
    };
  }
}
