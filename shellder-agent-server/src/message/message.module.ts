import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

/**
 * 消息模块（功能清单 §4.2 / §1.2 / 架构 §4.2 Message）。
 * - 消息存储独立于 Session 模块（架构 §4.2：消息存储不纳入 Session 模块）。
 * - 支持用户/系统/工具/确认四类消息。
 * - 按会话查询消息与时间线。
 * - PermissionService 由全局 AuthModule 提供。
 * - 导出 MessageService 供 12-Agent Runtime / 15-OpenAPI 引用。
 */
@Module({
  imports: [PrismaModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
