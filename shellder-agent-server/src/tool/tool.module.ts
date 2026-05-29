import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ToolController } from './tool.controller';
import { ToolService } from './tool.service';
import { ToolTestService } from './tool-test.service';
import { SqlToolService } from './sql-tool.service';

/**
 * 工具注册与管理模块（功能清单 §1.5 / 架构 §4.3 Tool Registry）。
 * - Tool 四类（query/action/workflow/notification）CRUD、JSON Schema 校验、权限元数据。
 * - 调用测试：执行前走 Policy（PolicyService 由全局 PolicyModule 提供），Policy 拒绝不外呼。
 * - SQL 查询工具：只读 / 表白名单 / 行数 / 时长约束执行。
 * - PermissionService 由全局 AuthModule 提供；AuditService 由全局 AuditModule 提供。
 * - 导出 ToolService 供 10-能力路由 / 12-Agent 运行时 / 13-四类能力 引用。
 */
@Module({
  imports: [PrismaModule],
  controllers: [ToolController],
  providers: [ToolService, ToolTestService, SqlToolService],
  exports: [ToolService],
})
export class ToolModule {}
