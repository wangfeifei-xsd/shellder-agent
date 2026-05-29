import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertConfigDto {
  @IsString()
  @IsNotEmpty()
  configKey: string;

  @IsString()
  @IsNotEmpty()
  configValue: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class BatchUpsertConfigDto {
  items: UpsertConfigDto[];
}
