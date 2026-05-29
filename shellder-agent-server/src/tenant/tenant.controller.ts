import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { UpdateIsolationDto } from './dto/update-isolation.dto';
import { UpdateTenantStatusDto } from './dto/update-status.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Audit } from '../audit/decorators/audit.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { TenantService } from './tenant.service';

@Controller('api/v1/tenants')
@RequireMenu('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  list(@Query() query: QueryTenantDto) {
    return this.tenantService.findMany(query);
  }

  @Post()
  @Audit({ action: 'tenant.create', module: 'tenant.manage', targetType: 'tenant' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Patch(':id')
  @Audit({ action: 'tenant.update', module: 'tenant.manage', targetType: 'tenant' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantService.update(id, dto);
  }

  @Patch(':id/status')
  @Audit({ action: 'tenant.updateStatus', module: 'tenant.manage', targetType: 'tenant' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenantService.updateStatus(id, dto.status);
  }

  @Get(':id/isolation')
  getIsolation(@Param('id') id: string) {
    return this.tenantService.getIsolation(id);
  }

  @Patch(':id/isolation')
  @Audit({ action: 'tenant.updateIsolation', module: 'tenant.manage', targetType: 'tenant' })
  updateIsolation(@Param('id') id: string, @Body() dto: UpdateIsolationDto) {
    return this.tenantService.updateIsolation(id, dto);
  }
}
