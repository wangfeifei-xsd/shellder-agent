import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryExecutionDto {
  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsEnum(['success', 'failed', 'running', 'timeout'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  startFrom?: string;

  @IsString()
  @IsOptional()
  startTo?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;
}
