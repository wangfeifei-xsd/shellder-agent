import { RuleAction, RuleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RuleConditionsDto } from './rule-conditions.dto';

export class CreateRuleDto {
  /** 规则所属租户（按租户隔离；非超管须为本人绑定租户） */
  @IsString()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsEnum(RuleType)
  type!: RuleType;

  @IsOptional()
  @ValidateNested()
  @Type(() => RuleConditionsDto)
  conditions?: RuleConditionsDto;

  @IsEnum(RuleAction)
  action!: RuleAction;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}
