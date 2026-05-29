import { CapabilityStatus, CapabilityType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryCapabilityDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(CapabilityType)
  type?: CapabilityType;

  @IsOptional()
  @IsEnum(CapabilityStatus)
  status?: CapabilityStatus;

  @IsOptional()
  @IsString()
  keyword?: string;

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
