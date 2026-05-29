import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MENU_KEYS, MODULE_KEYS } from '../../../auth/permissions';
import { RolePolicyDto } from './role-policy.dto';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code 仅允许字母、数字、下划线、连字符',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  /** 菜单权限 key 列表 */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MENU_KEYS, { each: true })
  menus?: string[];

  /** 模块权限 key 列表 */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MODULE_KEYS, { each: true })
  modules?: string[];

  /** Tool 权限范围（工具注册模块就绪前为自由字符串列表） */
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
