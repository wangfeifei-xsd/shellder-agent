import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapabilityKey,
  EffectivePermissions,
  EMPTY_ROLE_POLICY,
  PERMISSION_WILDCARD,
  RolePolicy,
} from './permissions';

/** role.policy 的归一化读取 */
export function readRolePolicy(role: Pick<Role, 'policy'>): RolePolicy {
  const raw = (role.policy ?? {}) as Partial<RolePolicy>;
  return {
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
    canApproveHighRisk: raw.canApproveHighRisk === true,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /** 聚合某用户全部角色的有效权限 */
  async resolveForUser(userId: string): Promise<EffectivePermissions> {
    const roleLinks = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return this.aggregate(roleLinks.map((link) => link.role));
  }

  aggregate(roles: Role[]): EffectivePermissions {
    const menus = new Set<string>();
    const modules = new Set<string>();
    const toolScopes = new Set<string>();
    const capabilities = new Set<CapabilityKey>();
    let canApproveHighRisk = false;

    for (const role of roles) {
      asStringArray(role.menus).forEach((m) => menus.add(m));
      asStringArray(role.modules).forEach((m) => modules.add(m));
      asStringArray(role.toolScopes).forEach((t) => toolScopes.add(t));
      const policy = readRolePolicy(role) ?? EMPTY_ROLE_POLICY;
      policy.capabilities.forEach((c) => capabilities.add(c));
      if (policy.canApproveHighRisk) canApproveHighRisk = true;
    }

    const isSuperAdmin = menus.has(PERMISSION_WILDCARD);

    return {
      menus: [...menus],
      modules: [...modules],
      toolScopes: [...toolScopes],
      capabilities: [...capabilities],
      canApproveHighRisk,
      isSuperAdmin,
    };
  }
}
