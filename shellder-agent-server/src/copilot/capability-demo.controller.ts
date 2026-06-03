import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.types';
import { PermissionService } from '../auth/permission.service';
import { CopilotAuthService } from './copilot-auth.service';
import { CapabilityDemoCopilotTokenDto } from './dto/capability-demo.dto';

/**
 * 管理能力演示 — 与嵌入式 Copilot 对齐的代换票入口。
 * 路径：POST /api/v1/capabilities/demo/copilot-token
 */
@Controller('api/v1/capabilities/demo')
export class CapabilityDemoController {
  constructor(
    private readonly copilotAuth: CopilotAuthService,
    private readonly permissionService: PermissionService,
  ) {}

  @Post('copilot-token')
  async copilotToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: CapabilityDemoCopilotTokenDto,
  ) {
    await this.assertTenantAccess(user, dto.tenantId);
    return this.copilotAuth.issueDemoToken({
      tenantId: dto.tenantId,
      copilotConfigId: dto.copilotConfigId,
      adminUserId: user.id,
      externalUserId: dto.externalUserId,
    });
  }

  private async assertTenantAccess(user: AuthUser, tenantId: string) {
    const permissions = await this.permissionService.resolveForUser(user.id);
    if (permissions.isSuperAdmin) return;
    if (!(user.tenantIds ?? []).includes(tenantId)) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: '无该租户的访问权限',
      });
    }
  }
}
