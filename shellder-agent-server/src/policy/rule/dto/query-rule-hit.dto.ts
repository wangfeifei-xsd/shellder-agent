import { RuleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryRuleHitDto {
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
  @IsString()
  ruleId?: string;

  @IsOptional()
  @IsEnum(RuleType)
  ruleType?: RuleType;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  /** 按规则名称 / Tool 名称模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;
}
