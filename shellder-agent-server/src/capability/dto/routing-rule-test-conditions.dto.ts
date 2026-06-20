import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class RoutingRuleTestConditionsDto {
  @IsString()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  input!: string;

  @IsObject()
  conditions!: Record<string, unknown>;
}
