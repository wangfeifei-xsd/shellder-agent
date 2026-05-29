import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';

/**
 * 审批中心模块（全局，功能清单 §1.8）。
 * - 导出 ApprovalService 供 Agent Runtime 在确认中断时创建审批记录。
 * - 提供审批列表、详情、确认/驳回接口。
 * - PermissionService 由全局 AuthModule 提供。
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
