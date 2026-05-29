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
import { CreateToolDto } from './dto/create-tool.dto';
import { QueryToolDto } from './dto/query-tool.dto';
import { TestSqlDto, TestToolDto } from './dto/test-tool.dto';
import { UpdateToolStatusDto } from './dto/update-status.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import { ToolService } from './tool.service';
import { ToolTestService } from './tool-test.service';

/** 工具注册与管理（功能清单 §1.5）；归属「工具管理」菜单（tool） */
@Controller('api/v1/tools')
@RequireMenu('tool')
export class ToolController {
  constructor(
    private readonly toolService: ToolService,
    private readonly toolTestService: ToolTestService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryToolDto) {
    return this.toolService.findMany(user, query);
  }

  @Post()
  @Audit({ action: 'tool.create', module: 'tool.manage', targetType: 'tool' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateToolDto) {
    return this.toolService.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.toolService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'tool.update', module: 'tool.manage', targetType: 'tool' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateToolDto,
  ) {
    return this.toolService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Audit({ action: 'tool.updateStatus', module: 'tool.manage', targetType: 'tool' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateToolStatusDto,
  ) {
    return this.toolService.updateStatus(user, id, dto.status);
  }

  @Delete(':id')
  @Audit({ action: 'tool.delete', module: 'tool.manage', targetType: 'tool' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.toolService.remove(user, id);
  }

  /**
   * 调用测试（执行计划 §4.4）：执行前走 Policy；Policy 拒绝 / 需确认时不执行外部调用（验收标准 2）。
   * 返回原始请求/响应、转换结果、schema 校验结果、Policy 决策。
   */
  @Post(':id/test')
  @Audit({ action: 'tool.test', module: 'tool.manage', targetType: 'tool' })
  async test(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TestToolDto,
  ) {
    const tool = await this.toolService.getForUser(user, id);
    return this.toolTestService.test(user, tool, dto);
  }

  /**
   * SQL 查询工具测试（执行计划 §4.5）：只读 / 白名单 / 行数 / 时长校验后执行（验收标准 3）。
   */
  @Post(':id/sql-test')
  @Audit({ action: 'tool.sqlTest', module: 'tool.manage', targetType: 'tool' })
  async sqlTest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TestSqlDto,
  ) {
    const tool = await this.toolService.getForUser(user, id);
    return this.toolTestService.sqlTest(user, tool, dto);
  }
}
