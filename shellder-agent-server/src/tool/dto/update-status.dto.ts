import { ToolStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateToolStatusDto {
  @IsEnum(ToolStatus)
  status!: ToolStatus;
}
