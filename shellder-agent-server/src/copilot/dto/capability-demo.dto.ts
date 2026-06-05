import {
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';

/** 管理端能力演示 — 代换 Copilot JWT（与 /copilot/v1/auth/token 响应体一致） */
export class CapabilityDemoCopilotTokenDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  copilotConfigId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalUserId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  scopeList?: string[];
}
