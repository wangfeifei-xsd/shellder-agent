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

/** 规则匹配条件 DSL（对应 Prisma rule.conditions） */
export class RuleConditionsDto {
  @IsOptional()
  @IsIn(['all', 'any'])
  match?: 'all' | 'any';

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  toolNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  toolNameContains?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(RISK_LEVELS, { each: true })
  riskLevels?: ('low' | 'medium' | 'high')[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsBoolean()
  needConfirmation?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionScopes?: string[];
}
