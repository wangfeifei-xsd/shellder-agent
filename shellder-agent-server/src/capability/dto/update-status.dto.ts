import { CapabilityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCapabilityStatusDto {
  @IsEnum(CapabilityStatus)
  status!: CapabilityStatus;
}
