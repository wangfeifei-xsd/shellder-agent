import { PromptCategory, PromptRole, PromptScope } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePromptTemplateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  promptKey!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsEnum(PromptCategory)
  category!: PromptCategory;

  @IsEnum(PromptRole)
  role!: PromptRole;

  @IsEnum(PromptScope)
  scope: PromptScope = PromptScope.global;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsObject()
  variableSchema?: Record<string, unknown>;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  changelog?: string;
}
