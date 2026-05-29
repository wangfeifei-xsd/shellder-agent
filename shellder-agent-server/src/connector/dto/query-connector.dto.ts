import { ConnectorStatus, ConnectorType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryConnectorDto {
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
  @IsEnum(ConnectorType)
  type?: ConnectorType;

  @IsOptional()
  @IsEnum(ConnectorStatus)
  status?: ConnectorStatus;

  /** 按连接器名称 / 目标地址模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;
}
