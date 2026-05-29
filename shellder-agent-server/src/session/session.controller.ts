import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateDebugSessionDto } from './dto/create-debug-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { ContextQueryDto } from './dto/context.dto';
import { SessionService } from './session.service';

/** 会话管理（功能清单 §1.2 / §4.1）；归属「会话管理」菜单（session） */
@Controller('api/v1/sessions')
@RequireMenu('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @Audit({ action: 'session.create', module: 'session', targetType: 'session' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    return this.sessionService.create(user, dto);
  }

  /**
   * POST /api/v1/sessions/debug — 创建调试会话（§1.2 调试台，Phase 16）。
   * 需放在 :id 路由之前避免路由冲突。
   */
  @Post('debug')
  @Audit({ action: 'session.createDebug', module: 'session', targetType: 'session' })
  createDebugSession(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDebugSessionDto,
  ) {
    return this.sessionService.createDebugSession(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QuerySessionDto) {
    return this.sessionService.findMany(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessionService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'session.update', module: 'session', targetType: 'session' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionService.update(user, id, dto);
  }

  /**
   * 上下文装配（验收标准 3）：返回最近 N 条消息 + 摘要，供 12-Agent Runtime 调用。
   */
  @Get(':id/context')
  context(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ContextQueryDto,
  ) {
    return this.sessionService.getContext(user, id, query.limit ?? 50);
  }
}
