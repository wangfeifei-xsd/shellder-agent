import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const RISK_LEVELS = ['low', 'medium', 'high'] as const;

/**
 * Policy 试评估入参（验收标准 1：配置规则后可返回 needConfirm，07 前 Mock 即可）。
 * tenantId 由路径/上下文校验，其余为模拟的 Tool 执行上下文。
 */
export class EvaluateDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  toolName?: string;

  @IsOptional()
  @IsIn(RISK_LEVELS)
  riskLevel?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsBoolean()
  needConfirmation?: boolean;

  @IsOptional()
  @IsString()
  capability?: string;

  @IsOptional()
  @IsString()
  permissionScope?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  userCapabilities?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requestSummary?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  /** 是否将命中写入 rule_hit（默认 true，便于在命中记录页核对，验收标准 2） */
  @IsOptional()
  @IsBoolean()
  persistHits?: boolean;
}
