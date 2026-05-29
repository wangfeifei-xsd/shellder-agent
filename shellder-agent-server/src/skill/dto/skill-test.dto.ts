import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SkillTestDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  capabilityType?: string;
}
