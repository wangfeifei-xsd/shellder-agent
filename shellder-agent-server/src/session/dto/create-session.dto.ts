import { CapabilityType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSessionDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @IsOptional()
  @IsEnum(CapabilityType)
  capabilityType?: CapabilityType;
}
