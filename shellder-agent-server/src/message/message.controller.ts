import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessageDto } from './dto/query-message.dto';
import { MessageService } from './message.service';

/** 消息管理（功能清单 §4.2 / §1.2）；归属「会话管理」菜单（session） */
@Controller('api/v1')
@RequireMenu('session')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  /**
   * 追加消息到指定会话。
   * 路径：POST /api/v1/sessions/:sessionId/messages（与执行计划保持一致）。
   * 同时通过 POST /api/v1/messages 提供独立入口供内部模块调用。
   */
  @Post('sessions/:sessionId/messages')
  @Audit({ action: 'message.create', module: 'session', targetType: 'message' })
  createForSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateMessageDto,
  ) {
    dto.sessionId = sessionId;
    return this.messageService.create(user, dto);
  }

  /**
   * 消息时间线：GET /api/v1/sessions/:id/messages（执行计划 §6）。
   * 筛选：按消息类型。
   */
  @Get('sessions/:sessionId/messages')
  listBySession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Query() query: QueryMessageDto,
  ) {
    return this.messageService.findBySession(user, sessionId, query);
  }
}
