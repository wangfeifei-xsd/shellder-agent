import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class RenderPromptDto {
  @IsString()
  promptKey!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(['published', 'draft'] as const)
  channel?: 'published' | 'draft';

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class RenderTestLlmDto extends RenderPromptDto {
  @IsOptional()
  @IsString()
  userMessage?: string;
}
