import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Audit } from '../../audit/decorators/audit.decorator';
import { RequireMenu } from '../../auth/decorators/require-permission.decorator';
import { UpdatePermissionPolicyDto } from './dto/update-policy.dto';
import { PermissionPolicyService } from './permission-policy.service';

@Controller('api/v1/permission-policies')
@RequireMenu('user')
export class PermissionPolicyController {
  constructor(private readonly service: PermissionPolicyService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':roleId')
  detail(@Param('roleId') roleId: string) {
    return this.service.findByRole(roleId);
  }

  @Patch(':roleId')
  @Audit({
    action: 'permissionPolicy.update',
    module: 'policy.manage',
    targetType: 'role',
  })
  update(
    @Param('roleId') roleId: string,
    @Body() dto: UpdatePermissionPolicyDto,
  ) {
    return this.service.update(roleId, dto);
  }
}
