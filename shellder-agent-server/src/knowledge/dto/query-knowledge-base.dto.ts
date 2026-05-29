import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryKnowledgeBaseDto {
  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsEnum(['active', 'disabled'])
  @IsOptional()
  status?: string;

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
