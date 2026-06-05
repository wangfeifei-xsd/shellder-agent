import { IsOptional, IsString, MinLength } from 'class-validator';
import { QueryPrincipalContextFieldsDto } from './query-principal-context.dto';

export class Nl2SqlPreviewDto extends QueryPrincipalContextFieldsDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  params?: Record<string, unknown>;
}
