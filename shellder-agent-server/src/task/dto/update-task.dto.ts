import { TaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  currentNode?: string;

  @IsOptional()
  output?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  failReason?: string;
}
