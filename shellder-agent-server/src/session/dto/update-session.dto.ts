import { CapabilityType, SessionStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsEnum(CapabilityType)
  capabilityType?: CapabilityType;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsBoolean()
  hasTask?: boolean;

  @IsOptional()
  @IsBoolean()
  hasConfirmation?: boolean;
}
