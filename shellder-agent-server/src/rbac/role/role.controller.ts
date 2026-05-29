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
import { RequireMenu } from '../../auth/decorators/require-permission.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { QueryRoleDto } from './dto/query-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

@Controller('api/v1/roles')
@RequireMenu('user')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  list(@Query() query: QueryRoleDto) {
    return this.roleService.findMany(query);
  }

  @Post()
  @Audit({ action: 'role.create', module: 'role.manage', targetType: 'role' })
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.roleService.findOne(id);
  }

  @Patch(':id')
  @Audit({ action: 'role.update', module: 'role.manage', targetType: 'role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'role.delete', module: 'role.manage', targetType: 'role' })
  remove(@Param('id') id: string) {
    return this.roleService.remove(id);
  }
}
