import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 查询试跑 / 测试用主体上下文（对齐嵌入 Copilot scopeList、externalUserId） */
export class QueryPrincipalContextFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalUserId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  scopeList?: string[];
}
