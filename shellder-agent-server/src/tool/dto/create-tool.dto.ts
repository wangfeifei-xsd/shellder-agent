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
 * 新建 Tool。
 * - inputSchema 必填且须为合法 JSON Schema（服务层 ajv 校验，非法拒绝）。
 * - connectorId 按类型校验（query→db_readonly / action→http / notification→notification）。
 * - config 为类型相关配置（sql / http / workflow），服务层归一化与校验。
 */
export class CreateToolDto {
  /** 所属租户（按租户隔离；非超管须为本人绑定租户；禁用租户不可新建） */
  @IsString()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsEnum(ToolType)
  type!: ToolType;

  /** 入参 JSON Schema（必填，须合法） */
  @IsObject()
  inputSchema!: Record<string, unknown>;

  /** 出参 JSON Schema（可选，若提供须合法） */
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

  /** 关联连接器（按需） */
  @IsOptional()
  @IsString()
  connectorId?: string;

  /** 类型相关配置：{ sql?, http?, workflow? } */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
