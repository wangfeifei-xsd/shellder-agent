import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequireMenu } from '../../auth/decorators/require-permission.decorator';
import { AuthUser } from '../../auth/jwt.types';
import { QueryRuleHitDto } from './dto/query-rule-hit.dto';
import { RuleService } from './rule.service';

/** 规则命中记录（功能清单 §1.7）；归属「知识库与规则」菜单（knowledge） */
@Controller('api/v1/rule-hits')
@RequireMenu('knowledge')
export class RuleHitController {
  constructor(private readonly ruleService: RuleService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryRuleHitDto) {
    return this.ruleService.findHits(user, query);
  }
}
