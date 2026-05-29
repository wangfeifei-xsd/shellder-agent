import { RuleStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateRuleStatusDto {
  @IsEnum(RuleStatus)
  status!: RuleStatus;
}
