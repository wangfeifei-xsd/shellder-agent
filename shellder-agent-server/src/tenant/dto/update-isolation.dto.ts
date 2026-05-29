import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { DataIsolationStrategy } from './tenant-config.dto';

/** 租户隔离配置（执行计划 §3.5） */
export class UpdateIsolationDto {
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
