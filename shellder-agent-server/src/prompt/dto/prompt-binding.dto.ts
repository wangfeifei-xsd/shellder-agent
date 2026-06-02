import { PromptBindType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryPromptBindingDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(PromptBindType)
  bindType?: PromptBindType;

  @IsOptional()
  @IsString()
  bindId?: string;

  @IsOptional()
  @IsString()
  promptKey?: string;
}

export class CreatePromptBindingDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsEnum(PromptBindType)
  bindType!: PromptBindType;

  @IsOptional()
  @IsString()
  bindId?: string;

  @IsString()
  @MaxLength(128)
  promptKey!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;
}

export class UpdatePromptBindingDto {
  @IsOptional()
  @IsString()
  promptKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;
}
