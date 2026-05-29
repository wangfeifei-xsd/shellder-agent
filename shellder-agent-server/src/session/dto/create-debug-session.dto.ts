import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDebugSessionDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  scenario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  simulateUserId?: string;
}
