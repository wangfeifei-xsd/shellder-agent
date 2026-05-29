import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { AuditQueryService } from './audit-query.service';
import {
  QueryExternalCallDto,
  QueryRiskActionDto,
  QueryToolCallDto,
  QueryUserActionDto,
} from './dto/query-audit.dto';

/** 审计中心查询接口（功能清单 §1.9）；统一要求 audit 菜单权限 */
@Controller('api/v1/audit')
@RequireMenu('audit')
export class AuditController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  @Get('tool-calls')
  toolCalls(@CurrentUser() user: AuthUser, @Query() query: QueryToolCallDto) {
    return this.auditQuery.findToolCalls(user, query);
  }

  @Get('user-actions')
  userActions(@CurrentUser() user: AuthUser, @Query() query: QueryUserActionDto) {
    return this.auditQuery.findUserActions(user, query);
  }

  @Get('external-calls')
  externalCalls(@CurrentUser() user: AuthUser, @Query() query: QueryExternalCallDto) {
    return this.auditQuery.findExternalCalls(user, query);
  }

  @Get('risk-actions')
  riskActions(@CurrentUser() user: AuthUser, @Query() query: QueryRiskActionDto) {
    return this.auditQuery.findRiskActions(user, query);
  }
}
