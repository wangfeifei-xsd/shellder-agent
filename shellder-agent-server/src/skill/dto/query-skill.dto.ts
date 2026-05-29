import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QuerySkillDto {
  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsEnum(['qa', 'query', 'action', 'workflow'])
  @IsOptional()
  capabilityType?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(['draft', 'enabled', 'disabled'])
  @IsOptional()
  status?: string;

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  riskLevel?: string;

  @IsString()
  @IsOptional()
  keyword?: string;

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
