import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionService } from '../auth/permission.service';
import { AuthUser } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';

export interface TenantAccessOptions {
  /** 无自定义文案时生成：无该租户的{resource}访问权限 */
  resource?: string;
  /** 完全自定义 Forbidden 文案（优先于 resource） */
  forbiddenMessage?: string;
}

export interface TenantEnabledOptions {
  /** 无自定义文案时生成：该租户已禁用，不可{action} */
  action?: string;
  disabledMessage?: string;
}

/**
 * 管理端租户隔离：访问权校验、禁用租户拦截、列表租户范围过滤。
 * 供各业务 Service 复用，避免 assertTenantAccess / resolveTenantFilter 重复实现。
 */
@Injectable()
export class TenantScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async assertAccess(
    user: AuthUser,
    tenantId: string,
    options?: TenantAccessOptions,
  ): Promise<void> {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      const message =
        options?.forbiddenMessage ??
        (options?.resource
          ? `无该租户的${options.resource}访问权限`
          : '无该租户的访问权限');
      throw new ForbiddenException({ code: 'TENANT_FORBIDDEN', message });
    }
  }

  async assertEnabled(
    tenantId: string,
    options?: TenantEnabledOptions,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `租户不存在：${tenantId}`,
      });
    }
    if (tenant.status === 'disabled') {
      const message =
        options?.disabledMessage ??
        `该租户已禁用，不可${options?.action ?? '操作'}`;
      throw new ForbiddenException({ code: 'TENANT_DISABLED', message });
    }
  }

  /**
   * 列表查询租户范围：超管可查全部或按指定 tenantId 过滤；非超管仅可见其绑定租户。
   */
  async resolveFilter(
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
}
