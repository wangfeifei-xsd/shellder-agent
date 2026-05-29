import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRoutingRuleDto {
  @IsString()
  tenantId!: string;

  @IsString()
  capabilityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsObject()
  conditions!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  needConfirmation?: boolean;
}
