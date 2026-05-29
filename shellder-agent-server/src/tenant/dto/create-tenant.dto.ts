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

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  /** 平台内唯一编码：字母数字、下划线、连字符 */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code 仅允许字母、数字、下划线、连字符',
  })
  code!: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  /** 租户管理员（平台用户）；用户模块未就绪时可空 */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  adminUserId?: string;

  /** 上层业务租户标识，非同步字段 */
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
