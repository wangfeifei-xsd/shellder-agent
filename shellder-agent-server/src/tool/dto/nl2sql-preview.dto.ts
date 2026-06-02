import { IsOptional, IsString, MinLength } from 'class-validator';

export class Nl2SqlPreviewDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  params?: Record<string, unknown>;
}
