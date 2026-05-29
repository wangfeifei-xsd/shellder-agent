import { SetMetadata } from '@nestjs/common';
import { MenuKey, ModuleKey } from '../permissions';

export const REQUIRE_MENU_KEY = 'requireMenu';
export const REQUIRE_MODULE_KEY = 'requireModule';

/** 要求拥有指定菜单权限，否则 403（验收标准 2） */
export const RequireMenu = (menu: MenuKey) => SetMetadata(REQUIRE_MENU_KEY, menu);

/** 要求拥有指定模块（写）权限，否则 403 */
export const RequireModule = (module: ModuleKey) =>
  SetMetadata(REQUIRE_MODULE_KEY, module);
