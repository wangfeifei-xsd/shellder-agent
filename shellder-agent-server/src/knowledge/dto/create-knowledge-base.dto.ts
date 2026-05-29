import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateKnowledgeBaseDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  embeddingModel?: string;

  @IsEnum(['cosine', 'euclidean', 'dot_product'])
  @IsOptional()
  similarityMetric?: 'cosine' | 'euclidean' | 'dot_product';

  @IsEnum(['fixed_size', 'paragraph', 'sentence'])
  @IsOptional()
  chunkStrategy?: 'fixed_size' | 'paragraph' | 'sentence';

  @IsInt()
  @IsOptional()
  @Min(100)
  chunkSize?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  chunkOverlap?: number;
}
