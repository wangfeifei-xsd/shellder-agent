import { ToolRiskLevel, ToolStatus, ToolType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryToolDto {
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
  @IsEnum(ToolType)
  type?: ToolType;

  @IsOptional()
  @IsEnum(ToolStatus)
  status?: ToolStatus;

  @IsOptional()
  @IsEnum(ToolRiskLevel)
  riskLevel?: ToolRiskLevel;

  /** 按关联连接器过滤 */
  @IsOptional()
  @IsString()
  connectorId?: string;

  /** 按名称 / 描述 / 权限范围模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;
}
