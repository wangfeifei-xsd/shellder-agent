import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConfirmActionDto {
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  comment?: string;
}
