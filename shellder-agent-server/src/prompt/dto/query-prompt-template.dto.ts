import { PromptCategory, PromptRole, PromptScope, PromptTemplateStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryPromptTemplateDto {
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

  @IsOptional()
  @IsEnum(PromptCategory)
  category?: PromptCategory;

  @IsOptional()
  @IsEnum(PromptRole)
  role?: PromptRole;

  @IsOptional()
  @IsEnum(PromptScope)
  scope?: PromptScope;

  @IsOptional()
  @IsEnum(PromptTemplateStatus)
  status?: PromptTemplateStatus;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  keyword?: string;
}
