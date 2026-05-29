import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateSkillDto } from './create-skill.dto';

export class UpdateSkillDto extends PartialType(
  OmitType(CreateSkillDto, ['tenantId'] as const),
) {}
