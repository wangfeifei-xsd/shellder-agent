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
import { RequireAnyMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { CreateToolDto } from './dto/create-tool.dto';
import { QueryToolDto } from './dto/query-tool.dto';
import { Nl2SqlPreviewDto } from './dto/nl2sql-preview.dto';
import { TestSqlDto, TestToolDto } from './dto/test-tool.dto';
import { UpdateToolStatusDto } from './dto/update-status.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import { ToolService } from './tool.service';
import { ToolTestService } from './tool-test.service';
import { ToolInvocationService } from './tool-invocation.service';
import { HttpQueryTriggerService } from './http-query-trigger.service';
import { HttpQueryAssistService } from './http-query-assist.service';
import { HttpQueryPolishDto } from './dto/http-query-polish.dto';
import { InvokeToolDto, ParseSignalDto } from './dto/invoke-tool.dto';

/** 工具注册与管理（功能清单 §1.5）；归属「工具管理」菜单（tool） */
@Controller('api/v1/tools')
@RequireAnyMenu('query', 'tool')
export class ToolController {
  constructor(
    private readonly toolService: ToolService,
    private readonly toolTestService: ToolTestService,
    private readonly invocation: ToolInvocationService,
    private readonly httpQueryTrigger: HttpQueryTriggerService,
    private readonly httpQueryAssist: HttpQueryAssistService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryToolDto) {
    return this.toolService.findMany(user, query);
  }

  /** HTTP 业务查询工具列表（type=http_query） */
  @Get('http-query')
  listHttpQuery(@CurrentUser() user: AuthUser, @Query() query: QueryToolDto) {
    return this.toolService.findMany(user, { ...query, type: 'http_query' });
  }

  /** AI 润色 HTTP 查询工具表单草稿 */
  @Post('http-query/polish-draft')
  polishHttpQueryDraft(@CurrentUser() user: AuthUser, @Body() dto: HttpQueryPolishDto) {
    return this.httpQueryAssist.polishDraft(user, dto);
  }

  /** 解析 LLM 信号 `[查询工具:tool_code {...}]` */
  @Post('parse-signal')
  parseSignal(@CurrentUser() user: AuthUser, @Body() dto: ParseSignalDto) {
    const parsed = this.httpQueryTrigger.parseSignal(dto.text);
    if (!parsed) {
      return { matched: false, message: '未匹配 HTTP 查询工具信号格式' };
    }
    return {
      matched: true,
      toolCode: parsed.toolCode,
      params: parsed.params,
      raw: parsed.raw,
    };
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

  /** 直连 Invoker 调试（与 test 结构对齐，http_query 优先使用） */
  @Post(':id/invoke')
  @Audit({ action: 'tool.invoke', module: 'tool.manage', targetType: 'tool' })
  async invoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: InvokeToolDto,
  ) {
    const tool = await this.toolService.getForUser(user, id);
    const params = dto.params ?? {};
    return this.invocation.invoke(tool, params, {
      tenantId: tool.tenantId,
      userId: user.id,
      callerName: user.username,
      source: 'admin_test',
      skipPolicy: dto.skipPolicy ?? false,
      requestSummary: JSON.stringify(params).slice(0, 256),
    });
  }

  /**
   * SQL 查询工具测试（执行计划 §4.5）：只读 / 黑名单 / 行数 / 时长校验后执行（验收标准 3）。
   */
  /** NL2SQL 试跑：仅生成 SQL，不连接库执行 */
  @Post(':id/nl2sql-preview')
  @Audit({ action: 'tool.nl2sqlPreview', module: 'tool.manage', targetType: 'tool' })
  async nl2sqlPreview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Nl2SqlPreviewDto,
  ) {
    const tool = await this.toolService.getForUser(user, id);
    return this.toolTestService.nl2sqlPreview(user, tool, dto);
  }

  /** 三步试跑：NL2SQL → 执行 → LLM 结果解读（与 Runtime 对齐） */
  @Post(':id/query-e2e-preview')
  @Audit({ action: 'tool.queryE2ePreview', module: 'tool.manage', targetType: 'tool' })
  async queryE2ePreview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Nl2SqlPreviewDto,
  ) {
    const tool = await this.toolService.getForUser(user, id);
    return this.toolTestService.queryE2ePreview(user, tool, dto);
  }

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
