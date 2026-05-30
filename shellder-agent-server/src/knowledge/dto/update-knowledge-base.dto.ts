import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateKnowledgeBaseDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  name?: string;

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

  @IsEnum(['active', 'disabled'])
  @IsOptional()
  status?: 'active' | 'disabled';

  @IsString()
  @IsOptional()
  @MaxLength(256)
  pathyWikiPrefix?: string;
}
