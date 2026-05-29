import { RoutingRuleStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateRoutingRuleStatusDto {
  @IsEnum(RoutingRuleStatus)
  status!: RoutingRuleStatus;
}
