import { UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryUserDto {
  /** 按用户名或显示名模糊匹配 */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** 按租户过滤（tenant.id） */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** 按角色过滤（role.id） */
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
