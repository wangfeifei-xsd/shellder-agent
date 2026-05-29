import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';

/**
 * 审计模块（全局）。
 * - 导出 AuditService 供其他模块（07 工具、06 连接器、13 业务能力、14 审批）采集调用。
 * - 注册全局 AuditInterceptor：标注 @Audit 的写接口自动记录用户操作审计。
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditQueryService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
