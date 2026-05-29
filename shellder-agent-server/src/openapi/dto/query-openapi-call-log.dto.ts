import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { OpenApiCallStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryOpenApiCallLogDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(OpenApiCallStatus)
  status?: OpenApiCallStatus;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

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
