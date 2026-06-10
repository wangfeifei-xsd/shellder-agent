import { CapabilityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCopilotSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  /** 手动选择的能力类型（必填，不走自动路由） */
  @IsEnum(CapabilityType)
  capabilityType!: CapabilityType;
}

export class UpdateCopilotSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;
}
