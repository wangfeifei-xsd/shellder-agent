import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';

export class CreateCopilotConfigDto {
  @IsString()
  tenantId: string;

  @IsString()
  appId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  domainWhitelist?: string[];

  @IsOptional()
  theme?: Record<string, unknown>;

  @IsOptional()
  features?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(200)
  maxHistoryMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(86400)
  tokenTtlSeconds?: number;
}

export class UpdateCopilotConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['enabled', 'disabled'])
  status?: 'enabled' | 'disabled';

  @IsOptional()
  @IsArray()
  domainWhitelist?: string[];

  @IsOptional()
  theme?: Record<string, unknown>;

  @IsOptional()
  features?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(200)
  maxHistoryMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(86400)
  tokenTtlSeconds?: number;
}

export class CopilotTokenExchangeDto {
  @IsString()
  clientId: string;

  @IsString()
  clientSecret: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  externalTenantId?: string;

  @IsOptional()
  @IsString()
  externalUserId?: string;

  /** 数据可见范围 ID 列表；空数组或未传 → 运行期不按范围维度过滤 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  scopeList?: string[];

  /** 问答型 wiki 子目录范围（层内相对路径，可多选）；空或未传 → 租户 wiki 全目录 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  wikiPrefixes?: string[];
}
