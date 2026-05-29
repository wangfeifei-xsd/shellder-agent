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
import { SkillService } from './skill.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { QuerySkillDto } from './dto/query-skill.dto';
import { UpdateSkillStatusDto } from './dto/update-skill-status.dto';
import { SkillTestDto } from './dto/skill-test.dto';
import { QueryExecutionDto } from './dto/query-execution.dto';

@Controller('api/v1/skills')
@RequireMenu('skill')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QuerySkillDto) {
    return this.skillService.findMany(user, query);
  }

  @Post()
  @Audit({ action: 'skill.create', module: 'skill.manage', targetType: 'skill' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSkillDto) {
    return this.skillService.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.skillService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'skill.update', module: 'skill.manage', targetType: 'skill' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.skillService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Audit({ action: 'skill.updateStatus', module: 'skill.manage', targetType: 'skill' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSkillStatusDto,
  ) {
    return this.skillService.updateStatus(user, id, dto.status);
  }

  @Delete(':id')
  @Audit({ action: 'skill.delete', module: 'skill.manage', targetType: 'skill' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.skillService.remove(user, id);
  }

  @Post('test')
  @Audit({ action: 'skill.test', module: 'skill.manage', targetType: 'skill' })
  testTrigger(@CurrentUser() user: AuthUser, @Body() dto: SkillTestDto) {
    return this.skillService.testTrigger(user, dto);
  }

  @Get(':id/executions')
  getExecutions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: QueryExecutionDto,
  ) {
    return this.skillService.getExecutions(user, id, query);
  }
}
