import { TenantStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TENANT_CAPABILITIES, TenantCapability } from './tenant-config.dto';

export class QueryTenantDto {
  /** 按名称或编码模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  /** 按开通能力筛选 */
  @IsOptional()
  @IsIn(TENANT_CAPABILITIES)
  capability?: TenantCapability;

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
}
