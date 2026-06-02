import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePromptVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  changelog?: string;
}
