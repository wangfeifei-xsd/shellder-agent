import { ConnectorType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
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

export class CreateConnectorDto {
  /** 所属租户（按租户隔离；非超管须为本人绑定租户；禁用租户不可新建） */
  @IsString()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsEnum(ConnectorType)
  type!: ConnectorType;

  /** 目标系统地址：http/notification 为 URL；db_readonly 为 host:port */
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  target!: string;

  @IsOptional()
  @IsIn(AUTH_TYPES)
  authType?: AuthType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(120000)
  timeoutMs?: number;

  /** 非敏感的类型相关配置（如 db 的 database/username、http 的固定 header） */
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  /** 可被哪些 Tool 引用（工具范围 key；07 工具按此校验） */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allowedToolScopes?: string[];

  /** 凭证字段（口令 / 令牌 / 密钥等）；加密后落库，不明文存储、不回显 */
  @IsOptional()
  @IsObject()
  secret?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}
