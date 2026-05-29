import { IsString, IsOptional, IsInt, IsEnum, IsArray, Min, Max } from 'class-validator';

export class CreateCopilotConfigDto {
  @IsString()
  tenantId: string;

  @IsString()
  appId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  domainWhitelist?: string[];

  @IsOptional()
  theme?: Record<string, unknown>;

  @IsOptional()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(200)
  maxHistoryMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(86400)
  tokenTtlSeconds?: number;
}

export class UpdateCopilotConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['enabled', 'disabled'])
  status?: 'enabled' | 'disabled';

  @IsOptional()
  @IsArray()
  domainWhitelist?: string[];

  @IsOptional()
  theme?: Record<string, unknown>;

  @IsOptional()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(200)
  maxHistoryMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(86400)
  tokenTtlSeconds?: number;
}

export class CopilotTokenExchangeDto {
  @IsString()
  clientId: string;

  @IsString()
  clientSecret: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  externalTenantId?: string;

  @IsOptional()
  @IsString()
  externalUserId?: string;
}
