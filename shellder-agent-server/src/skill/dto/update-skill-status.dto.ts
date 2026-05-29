import { IsEnum } from 'class-validator';

export class UpdateSkillStatusDto {
  @IsEnum(['draft', 'enabled', 'disabled'])
  status: 'draft' | 'enabled' | 'disabled';
}
