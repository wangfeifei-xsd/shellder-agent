import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PolicyService } from './policy.service';
import { RuleController } from './rule/rule.controller';
import { RuleHitController } from './rule/rule-hit.controller';
import { RuleService } from './rule/rule.service';

/**
 * Policy 模块（全局，架构 §4.2 / §8）。
 * - 导出 PolicyService 供 07 工具、12 运行时、14 审批在 Tool 执行前调用 evaluate。
 * - 提供规则配置 CRUD 与命中记录查询接口（功能清单 §1.7 规则部分）。
 * - PermissionService 由全局 AuthModule 提供，用于跨租户隔离判断。
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [RuleController, RuleHitController],
  providers: [PolicyService, RuleService],
  exports: [PolicyService],
})
export class PolicyModule {}
