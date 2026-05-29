import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { ApprovalService } from './approval.service';
import { QueryApprovalDto } from './dto/query-approval.dto';
import { ReviewApprovalDto } from './dto/review-approval.dto';

/** 审批中心（功能清单 §1.8）；归属「审批中心」菜单（approval） */
@Controller('api/v1/approvals')
@RequireMenu('approval')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  /** 待确认列表 / 审批记录列表 */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryApprovalDto) {
    return this.approvalService.findMany(user, query);
  }

  /** 审批详情 */
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.approvalService.findOne(user, id);
  }

  /** 确认执行 / 驳回 */
  @Post(':id/review')
  @Audit({
    action: 'approval.review',
    module: 'approval.manage',
    targetType: 'approval',
  })
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewApprovalDto,
  ) {
    return this.approvalService.review(user, id, dto.action, dto.opinion);
  }
}
