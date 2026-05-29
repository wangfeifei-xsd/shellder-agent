import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/**
 * 会话管理模块（功能清单 §4.1 / §1.2 / 架构 §4.2 Session）。
 * - 会话创建、列表筛选（按租户/用户/状态/能力类型/时间范围）、详情。
 * - 上下文装配接口（/context）供 12-Agent Runtime 调用。
 * - PermissionService 由全局 AuthModule 提供。
 * - 导出 SessionService 供 09-任务 / 12-Agent Runtime / 15-OpenAPI 引用。
 */
@Module({
  imports: [PrismaModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
