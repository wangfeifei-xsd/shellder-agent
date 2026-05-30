import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertLlmSettingsDto {
  @IsOptional()
  @IsString()
  base_url?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  api_key?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600_000)
  timeout_ms?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200_000)
  max_tokens?: number;

  @IsOptional()
  @IsString()
  chat_path?: string;
}

export class LlmConnectionTestDto {
  @IsOptional()
  @IsString()
  base_url?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  api_key?: string;
}
