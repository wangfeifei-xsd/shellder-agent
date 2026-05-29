import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

/** 开通能力（功能清单 §1.11 / 执行计划 §3.2）：问答型/查询型/操作型/流程型 */
export const TENANT_CAPABILITIES = ['qa', 'query', 'action', 'workflow'] as const;
export type TenantCapability = (typeof TENANT_CAPABILITIES)[number];

export enum DataIsolationStrategy {
  strict = 'strict',
  shared = 'shared',
}

export class TenantLimitsDto {
  /** 最大会话数，0 表示不限制 */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxSessions?: number;

  /** 最大任务数，0 表示不限制 */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTasks?: number;
}

export class TenantIsolationDto {
  @IsOptional()
  @IsEnum(DataIsolationStrategy)
  dataIsolationStrategy?: DataIsolationStrategy;

  @IsOptional()
  @IsBoolean()
  restrictCrossTenant?: boolean;

  @IsOptional()
  @IsBoolean()
  connectorVisibleWithinTenant?: boolean;

  @IsOptional()
  @IsBoolean()
  toolVisibleWithinTenant?: boolean;

  @IsOptional()
  @IsBoolean()
  auditVisibleWithinTenant?: boolean;
}

export class TenantConfigDto {
  @IsOptional()
  @IsArray()
  @IsIn(TENANT_CAPABILITIES, { each: true })
  capabilities?: TenantCapability[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantLimitsDto)
  limits?: TenantLimitsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantIsolationDto)
  isolation?: TenantIsolationDto;
}

/** 隔离配置默认值 */
export const DEFAULT_TENANT_ISOLATION: Required<TenantIsolationDto> = {
  dataIsolationStrategy: DataIsolationStrategy.strict,
  restrictCrossTenant: true,
  connectorVisibleWithinTenant: true,
  toolVisibleWithinTenant: true,
  auditVisibleWithinTenant: true,
};
