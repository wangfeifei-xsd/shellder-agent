import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { OpenApiAppStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryOpenApiAppDto {
  /** 按当前操作租户过滤：仅返回 allowedTenantIds 包含该租户的应用 */
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(OpenApiAppStatus)
  status?: OpenApiAppStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
