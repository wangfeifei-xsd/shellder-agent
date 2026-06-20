import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RoutingRuleAiOptimizeDto {
  @IsString()
  tenantId!: string;

  @IsString()
  capabilityId!: string;

  /** 未命中的测试用户输入 */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  testInput!: string;

  @IsObject()
  conditions!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  ruleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  ruleDescription?: string;
}
