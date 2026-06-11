import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  REQUIRE_ANY_MENU_KEY,
  REQUIRE_MENU_KEY,
  REQUIRE_MODULE_KEY,
} from '../decorators/require-permission.decorator';
import { expandLegacyMenuPermissions, hasAnyMenuPermission, hasPermission } from '../permissions';
import { PermissionService } from '../permission.service';

/**
 * 校验路由所需的菜单/模块权限。
 * 无对应菜单权限的用户访问该路由返回 403（验收标准 2）。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredMenu = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_MENU_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAnyMenu = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_ANY_MENU_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredModule = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredMenu && !requiredAnyMenu?.length && !requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '无访问权限',
      });
    }

    const permissions = await this.permissionService.resolveForUser(user.id);
    const effectiveMenus = expandLegacyMenuPermissions(permissions.menus);

    if (requiredMenu && !hasPermission(effectiveMenus, requiredMenu)) {
      throw new ForbiddenException({
        code: 'MENU_FORBIDDEN',
        message: `无菜单权限：${requiredMenu}`,
      });
    }

    if (
      requiredAnyMenu?.length &&
      !hasAnyMenuPermission(effectiveMenus, requiredAnyMenu)
    ) {
      throw new ForbiddenException({
        code: 'MENU_FORBIDDEN',
        message: `无菜单权限：${requiredAnyMenu.join(' / ')}`,
      });
    }

    if (
      requiredModule &&
      !permissions.isSuperAdmin &&
      !hasPermission(permissions.modules, requiredModule)
    ) {
      throw new ForbiddenException({
        code: 'MODULE_FORBIDDEN',
        message: `无模块权限：${requiredModule}`,
      });
    }

    return true;
  }
}
