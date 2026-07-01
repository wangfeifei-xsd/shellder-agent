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
import { Audit } from '../../audit/decorators/audit.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequireMenu } from '../../auth/decorators/require-permission.decorator';
import { AuthUser } from '../../auth/jwt.types';
import { TenantScopeService } from '../../tenant/tenant-scope.service';
import { PolicyService } from '../policy.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { EvaluateDto } from './dto/evaluate.dto';
import { QueryRuleDto } from './dto/query-rule.dto';
import { UpdateRuleStatusDto } from './dto/update-status.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RuleService } from './rule.service';

/** 规则配置（功能清单 §1.7）；归属「规则」菜单（rule） */
@Controller('api/v1/rules')
@RequireMenu('rule')
export class RuleController {
  constructor(
    private readonly ruleService: RuleService,
    private readonly policyService: PolicyService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryRuleDto) {
    return this.ruleService.findMany(user, query);
  }

  @Post()
  @Audit({ action: 'rule.create', module: 'rule.manage', targetType: 'rule' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRuleDto) {
    return this.ruleService.create(user, dto);
  }

  /**
   * 规则试评估（验收标准 1）：模拟 Tool 执行上下文，返回 { allow, needConfirm, matchedRules }。
   * 07 工具就绪前可用本接口（Mock 上下文）验证「高风险需确认」规则链路。
   */
  @Post('evaluate')
  async evaluate(@CurrentUser() user: AuthUser, @Body() dto: EvaluateDto) {
    await this.tenantScope.assertAccess(user, dto.tenantId, { resource: '规则' });
    return this.policyService.evaluate(
      {
        tenantId: dto.tenantId,
        userId: user.id,
        callerName: user.username,
        toolName: dto.toolName ?? null,
        riskLevel: dto.riskLevel ?? null,
        needConfirmation: dto.needConfirmation ?? null,
        capability: dto.capability ?? null,
        permissionScope: dto.permissionScope ?? null,
        userCapabilities: dto.userCapabilities ?? [],
        requestSummary: dto.requestSummary ?? null,
        sessionId: dto.sessionId ?? null,
        taskId: dto.taskId ?? null,
      },
      { persistHits: dto.persistHits ?? true },
    );
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ruleService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'rule.update', module: 'rule.manage', targetType: 'rule' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.ruleService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Audit({ action: 'rule.updateStatus', module: 'rule.manage', targetType: 'rule' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRuleStatusDto,
  ) {
    return this.ruleService.updateStatus(user, id, dto.status);
  }

  @Delete(':id')
  @Audit({ action: 'rule.delete', module: 'rule.manage', targetType: 'rule' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ruleService.remove(user, id);
  }
}
