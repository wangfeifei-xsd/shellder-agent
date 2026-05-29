import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';

/**
 * 技能书管理模块（功能清单 §1.5A / 架构 Skill Management）。
 * - 技能书 CRUD（SkillService）
 * - 触发测试
 * - 调用记录查询
 * - 导出 SkillService 供 12-Agent 运行时、16-调试台调用。
 */
@Module({
  imports: [PrismaModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
