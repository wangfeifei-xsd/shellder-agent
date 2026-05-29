import { CapabilityType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCapabilityDto {
  @IsString()
  tenantId!: string;

  @IsEnum(CapabilityType)
  type!: CapabilityType;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  applicableSystem?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependentTools?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionRequirements?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  priority?: number;
}
