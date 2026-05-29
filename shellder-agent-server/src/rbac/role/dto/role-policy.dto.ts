import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';
import { CAPABILITY_KEYS, CapabilityKey } from '../../../auth/permissions';

export class RolePolicyDto {
  /** 四类能力访问权限 */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CAPABILITY_KEYS, { each: true })
  capabilities?: CapabilityKey[];

  /** 高风险动作审批权限 */
  @IsOptional()
  @IsBoolean()
  canApproveHighRisk?: boolean;
}
