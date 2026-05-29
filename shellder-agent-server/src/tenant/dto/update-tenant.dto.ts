import { TenantStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TenantConfigDto } from './tenant-config.dto';

/** 编辑租户：所有字段可选（名称、编码、状态、管理员、能力、externalTenantId、备注） */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code 仅允许字母、数字、下划线、连字符',
  })
  code?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  adminUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalTenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantConfigDto)
  config?: TenantConfigDto;
}
