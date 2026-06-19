import { CapabilityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCopilotSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  /** 可选：auto/hybrid 下可不传，首条消息自动路由；pinned 模式下必填 */
  @IsOptional()
  @IsEnum(CapabilityType)
  capabilityType?: CapabilityType;
}

export class UpdateCopilotSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;
}
