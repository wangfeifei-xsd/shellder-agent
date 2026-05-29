import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MENU_KEYS, MODULE_KEYS } from '../../../auth/permissions';
import { RolePolicyDto } from './role-policy.dto';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MENU_KEYS, { each: true })
  menus?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MODULE_KEYS, { each: true })
  modules?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  toolScopes?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RolePolicyDto)
  policy?: RolePolicyDto;
}
