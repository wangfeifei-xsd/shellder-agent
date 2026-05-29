import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDataSourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsEnum(['file', 'url', 'api', 'connector'])
  type: 'file' | 'url' | 'api' | 'connector';

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  syncCron?: string;
}
