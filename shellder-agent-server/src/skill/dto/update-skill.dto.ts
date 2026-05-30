import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSkillBindingDto, CreateSkillTriggerDto } from './create-skill.dto';

/**
 * 更新技能书；不可迁移租户（tenantId 不在此 DTO 中）。
 */
export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsEnum(['qa', 'query', 'action', 'workflow'])
  capabilityType?: 'qa' | 'query' | 'action' | 'workflow';

  @IsOptional()
  @IsEnum(['draft', 'enabled', 'disabled'])
  status?: 'draft' | 'enabled' | 'disabled';

  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  riskLevel?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsBoolean()
  needConfirmation?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  permissionScope?: string;

  @IsOptional()
  @IsEnum(['tool', 'workflow'])
  entryMode?: 'tool' | 'workflow';

  @IsOptional()
  @IsString()
  entryToolId?: string;

  @IsOptional()
  @IsString()
  workflowToolId?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  preconditions?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  resultTemplate?: string;

  @IsOptional()
  @IsObject()
  missingParamStrategy?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  failureHint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSkillTriggerDto)
  triggers?: CreateSkillTriggerDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSkillBindingDto)
  bindings?: CreateSkillBindingDto[];
}
