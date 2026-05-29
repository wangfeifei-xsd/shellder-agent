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
import { CapabilityService } from './capability.service';
import { CreateCapabilityDto } from './dto/create-capability.dto';
import { QueryCapabilityDto } from './dto/query-capability.dto';
import { UpdateCapabilityDto } from './dto/update-capability.dto';
import { UpdateCapabilityStatusDto } from './dto/update-status.dto';

/** 能力目录管理（功能清单 §1.4 能力路由 / 能力目录） */
@Controller('api/v1/capabilities')
@RequireMenu('routing')
export class CapabilityController {
  constructor(private readonly capabilityService: CapabilityService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryCapabilityDto) {
    return this.capabilityService.findMany(user, query);
  }

  @Post()
  @Audit({ action: 'capability.create', module: 'routing.manage', targetType: 'capability' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCapabilityDto) {
    return this.capabilityService.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.capabilityService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'capability.update', module: 'routing.manage', targetType: 'capability' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCapabilityDto,
  ) {
    return this.capabilityService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Audit({ action: 'capability.updateStatus', module: 'routing.manage', targetType: 'capability' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCapabilityStatusDto,
  ) {
    return this.capabilityService.updateStatus(user, id, dto.status);
  }

  @Delete(':id')
  @Audit({ action: 'capability.delete', module: 'routing.manage', targetType: 'capability' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.capabilityService.remove(user, id);
  }
}
