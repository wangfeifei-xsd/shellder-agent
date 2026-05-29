import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { DashboardService } from './dashboard.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';

@Controller('api/v1/dashboard')
@RequireMenu('workbench')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: QueryDashboardDto) {
    return this.dashboardService.getSummary(user, query.tenantId);
  }
}
