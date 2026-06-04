import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RoutingRuleAiSuggestDto {
  @IsString()
  tenantId!: string;

  @IsString()
  capabilityId!: string;

  /** 希望匹配的业务场景 / 用户问法描述 */
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  intentDescription!: string;

  /** 示例用户输入（可选） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  sampleQueries?: string[];
}
