import { PromptTemplateStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePromptTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsObject()
  variableSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsEnum(PromptTemplateStatus)
  status?: PromptTemplateStatus;
}
