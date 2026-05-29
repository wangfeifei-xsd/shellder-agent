import { ToolRiskLevel, ToolType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * 更新 Tool；不可迁移租户（tenantId 不在此 DTO 中）。
 * connectorId 传空字符串表示解绑连接器。
 */
export class UpdateToolDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsEnum(ToolType)
  type?: ToolType;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  permissionScope?: string;

  @IsOptional()
  @IsEnum(ToolRiskLevel)
  riskLevel?: ToolRiskLevel;

  @IsOptional()
  @IsBoolean()
  needConfirmation?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(600000)
  timeoutMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  auditEventType?: string;

  /** 关联连接器（空字符串解绑） */
  @IsOptional()
  @IsString()
  connectorId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
