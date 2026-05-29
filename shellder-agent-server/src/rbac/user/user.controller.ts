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
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserStatusDto } from './dto/update-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('api/v1/users')
@RequireMenu('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  list(@Query() query: QueryUserDto) {
    return this.userService.findMany(query);
  }

  @Post()
  @Audit({ action: 'user.create', module: 'user.manage', targetType: 'user' })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @Audit({ action: 'user.update', module: 'user.manage', targetType: 'user' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Patch(':id/status')
  @Audit({ action: 'user.updateStatus', module: 'user.manage', targetType: 'user' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.userService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Audit({ action: 'user.delete', module: 'user.manage', targetType: 'user' })
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
