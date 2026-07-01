import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { CopilotAuthService } from './copilot-auth.service';
import { CapabilityDemoCopilotTokenDto } from './dto/capability-demo.dto';

/**
 * 管理能力演示 — 与嵌入式 Copilot 对齐的代换票入口。
 * 路径：POST /api/v1/capabilities/demo/copilot-token
 */
@Controller('api/v1/capabilities/demo')
@RequireMenu('capability')
export class CapabilityDemoController {
  constructor(
    private readonly copilotAuth: CopilotAuthService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Post('copilot-token')
  async copilotToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: CapabilityDemoCopilotTokenDto,
  ) {
    await this.tenantScope.assertAccess(user, dto.tenantId);
    return this.copilotAuth.issueDemoToken({
      tenantId: dto.tenantId,
      copilotConfigId: dto.copilotConfigId,
      adminUserId: user.id,
      externalUserId: dto.externalUserId,
      scopeList: dto.scopeList,
      wikiPrefixes: dto.wikiPrefixes,
    });
  }
}
