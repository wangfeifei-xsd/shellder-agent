import { AuditStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 分页基类 */
class PaginationDto {
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
}

/** 工具调用审计查询 */
export class QueryToolCallDto extends PaginationDto {
  @IsOptional()
  @IsString()
  toolName?: string;

  @IsOptional()
  @IsString()
  callerUserId?: string;

  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  /** 按 Tool 名称模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;
}

/** 用户操作审计查询 */
export class QueryUserActionDto extends PaginationDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  operatorUserId?: string;

  /** 按操作标识 / 摘要模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;
}

/** 外部接口审计查询 */
export class QueryExternalCallDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  /** 按目标系统模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;
}

/** 风险动作审计查询（聚合只读） */
export class QueryRiskActionDto extends PaginationDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}
