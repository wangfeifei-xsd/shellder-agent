import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { OpenApiAppStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryOpenApiAppDto {
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
