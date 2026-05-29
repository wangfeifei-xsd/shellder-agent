import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConnectivityTestService } from './connectivity-test.service';
import { ConnectorController } from './connector.controller';
import { ConnectorService } from './connector.service';

/**
 * 连接器管理模块（功能清单 §1.6 / 架构 §4.4）。
 * - 提供三类连接器（只读 DB / HTTP / 通知）配置 CRUD、连通性测试。
 * - 连通性测试记入 04 外部接口审计；写操作经全局 @Audit 落用户操作审计。
 * - PermissionService 由全局 AuthModule 提供；AuditService 由全局 AuditModule 提供。
 * - 导出 ConnectorService 供 07-工具管理 引用连接器。
 */
@Module({
  imports: [PrismaModule],
  controllers: [ConnectorController],
  providers: [ConnectorService, ConnectivityTestService],
  exports: [ConnectorService],
})
export class ConnectorModule {}
