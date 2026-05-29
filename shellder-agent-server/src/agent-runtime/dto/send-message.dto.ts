import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SendMessageMode } from '../agent-runtime.types';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsEnum(['sync', 'stream'])
  mode?: SendMessageMode;
}
