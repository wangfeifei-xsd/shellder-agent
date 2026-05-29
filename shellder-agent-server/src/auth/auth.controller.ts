import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from './jwt.types';
import { CAPABILITY_CATALOG, MENU_CATALOG, MODULE_CATALOG } from './permissions';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  /** 权限目录：供管理后台角色配置使用 */
  @Get('catalog')
  catalog() {
    return {
      menus: MENU_CATALOG,
      modules: MODULE_CATALOG,
      capabilities: CAPABILITY_CATALOG,
    };
  }
}
