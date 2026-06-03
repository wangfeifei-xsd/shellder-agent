import { MessageRole, MessageType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateMessageDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId!: string;

  @IsEnum(MessageType)
  type!: MessageType;

  @IsOptional()
  @IsEnum(MessageRole)
  role?: MessageRole;

  @IsObject()
  content!: Record<string, unknown>;
}
