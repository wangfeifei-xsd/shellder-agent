import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RetrieveDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  topK?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  threshold?: number;
}
