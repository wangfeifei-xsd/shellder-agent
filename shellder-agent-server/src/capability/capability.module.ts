import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CapabilityController } from './capability.controller';
import { CapabilityService } from './capability.service';
import { RoutingRuleController } from './routing-rule.controller';
import { RoutingRuleService } from './routing-rule.service';
import { RoutingTestController } from './routing-test.controller';
import { RoutingEngineService } from './routing-engine.service';

/**
 * 能力路由模块（功能清单 §1.4 / 架构 Capability Routing）。
 * - 能力目录 CRUD（CapabilityService）
 * - 路由规则 CRUD（RoutingRuleService）
 * - 路由引擎与路由测试（RoutingEngineService）
 * - 导出 RoutingEngineService 供 12-Agent 运行时、16-调试台调用。
 */
@Module({
  imports: [PrismaModule],
  controllers: [CapabilityController, RoutingRuleController, RoutingTestController],
  providers: [CapabilityService, RoutingRuleService, RoutingEngineService],
  exports: [RoutingEngineService, CapabilityService],
})
export class CapabilityModule {}
