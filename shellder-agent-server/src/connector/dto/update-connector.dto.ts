import { ConnectorType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AUTH_TYPES, AuthType } from '../connector.types';

/**
 * 更新连接器；不可迁移租户（tenantId 不在此 DTO 中）。
 * secret 语义：未传 → 保留原凭证；传空对象 {} → 清空凭证；传非空 → 覆盖。
 * clearSecret=true 显式清空凭证。
 */
export class UpdateConnectorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsEnum(ConnectorType)
  type?: ConnectorType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  target?: string;

  @IsOptional()
  @IsIn(AUTH_TYPES)
  authType?: AuthType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(120000)
  timeoutMs?: number;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allowedToolScopes?: string[];

  @IsOptional()
  @IsObject()
  secret?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  clearSecret?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}
