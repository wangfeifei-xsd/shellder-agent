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

/** 更新规则；不允许迁移租户（tenantId 不可改） */
export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsEnum(RuleType)
  type?: RuleType;

  @IsOptional()
  @ValidateNested()
  @Type(() => RuleConditionsDto)
  conditions?: RuleConditionsDto;

  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;

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
