import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSkillTriggerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  triggerText: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  triggerType?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  priority?: number;
}

export class CreateSkillBindingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  bindingType: string;

  @IsString()
  @IsNotEmpty()
  targetId: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  orderNo?: number;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}

export class CreateSkillDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

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
  @MaxLength(64)
  category?: string;

  @IsEnum(['qa', 'query', 'action', 'workflow'])
  capabilityType: 'qa' | 'query' | 'action' | 'workflow';

  @IsEnum(['draft', 'enabled', 'disabled'])
  @IsOptional()
  status?: 'draft' | 'enabled' | 'disabled';

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  riskLevel?: 'low' | 'medium' | 'high';

  @IsBoolean()
  @IsOptional()
  needConfirmation?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  permissionScope?: string;

  @IsEnum(['tool', 'workflow'])
  entryMode: 'tool' | 'workflow';

  @IsString()
  @IsOptional()
  entryToolId?: string;

  @IsString()
  @IsOptional()
  workflowToolId?: string;

  @IsObject()
  @IsOptional()
  inputSchema?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  outputSchema?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  preconditions?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  resultTemplate?: string;

  @IsObject()
  @IsOptional()
  missingParamStrategy?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  failureHint?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  remark?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSkillTriggerDto)
  triggers?: CreateSkillTriggerDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSkillBindingDto)
  bindings?: CreateSkillBindingDto[];
}
