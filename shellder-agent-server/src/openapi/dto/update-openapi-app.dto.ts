import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CapabilityType, OpenApiAppStatus } from '@prisma/client';

export class UpdateOpenApiAppDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsEnum(OpenApiAppStatus)
  status?: OpenApiAppStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTenantIds?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(CapabilityType, { each: true })
  allowedCapabilities?: CapabilityType[];

  @IsOptional()
  rateLimitConfig?: { rateLimit: number; windowMs: number } | null;
}
