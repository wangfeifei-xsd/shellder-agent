import { MessageRole, MessageType } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateMessageDto {
  @IsString()
  sessionId!: string;

  @IsEnum(MessageType)
  type!: MessageType;

  @IsOptional()
  @IsEnum(MessageRole)
  role?: MessageRole;

  @IsObject()
  content!: Record<string, unknown>;
}
