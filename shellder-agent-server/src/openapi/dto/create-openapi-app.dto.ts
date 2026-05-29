import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CapabilityType } from '@prisma/client';

export class CreateOpenApiAppDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  allowedTenantIds: string[];

  @IsArray()
  @IsEnum(CapabilityType, { each: true })
  allowedCapabilities: CapabilityType[];

  @IsOptional()
  rateLimitConfig?: { rateLimit: number; windowMs: number };
}
