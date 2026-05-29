import { RuleAction, RuleStatus, RuleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryRuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /** 显式指定租户过滤（仅超级管理员有效；非超管按绑定租户强制过滤） */
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(RuleType)
  type?: RuleType;

  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;

  @IsOptional()
  @IsEnum(RuleStatus)
  status?: RuleStatus;

  /** 按规则名称模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;
}
