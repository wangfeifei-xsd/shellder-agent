import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { RoutingRuleAssistService } from './routing-rule-assist.service';
import { RoutingRuleService } from './routing-rule.service';
import { CreateRoutingRuleDto } from './dto/create-routing-rule.dto';
import { QueryRoutingRuleDto } from './dto/query-routing-rule.dto';
import { RoutingRuleAiSuggestDto } from './dto/routing-rule-ai-suggest.dto';
import { UpdateRoutingRuleDto } from './dto/update-routing-rule.dto';
import { UpdateRoutingRuleStatusDto } from './dto/update-routing-rule-status.dto';

/** 路由规则管理（功能清单 §1.4 能力路由 / 路由规则） */
@Controller('api/v1/routing-rules')
@RequireMenu('routing')
export class RoutingRuleController {
  constructor(
    private readonly routingRuleService: RoutingRuleService,
    private readonly routingRuleAssist: RoutingRuleAssistService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryRoutingRuleDto) {
    return this.routingRuleService.findMany(user, query);
  }

  /** POST /api/v1/routing-rules/ai-suggest — AI 生成路由规则草案（须在 :id 路由之前注册） */
  @Post('ai-suggest')
  @Audit({
    action: 'routingRule.aiSuggest',
    module: 'routing.manage',
    targetType: 'routing_rule',
  })
  aiSuggest(@CurrentUser() user: AuthUser, @Body() dto: RoutingRuleAiSuggestDto) {
    return this.routingRuleAssist.suggest(user, dto);
  }

  @Post()
  @Audit({ action: 'routingRule.create', module: 'routing.manage', targetType: 'routing_rule' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoutingRuleDto) {
    return this.routingRuleService.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routingRuleService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'routingRule.update', module: 'routing.manage', targetType: 'routing_rule' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoutingRuleDto,
  ) {
    return this.routingRuleService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Audit({ action: 'routingRule.updateStatus', module: 'routing.manage', targetType: 'routing_rule' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoutingRuleStatusDto,
  ) {
    return this.routingRuleService.updateStatus(user, id, dto.status);
  }

  @Delete(':id')
  @Audit({ action: 'routingRule.delete', module: 'routing.manage', targetType: 'routing_rule' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routingRuleService.remove(user, id);
  }
}
