import { ConnectorStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateConnectorStatusDto {
  @IsEnum(ConnectorStatus)
  status!: ConnectorStatus;
}
