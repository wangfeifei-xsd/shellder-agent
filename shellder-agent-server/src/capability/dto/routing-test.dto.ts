import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RoutingTestDto {
  @IsString()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  input!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export interface RoutingTestResult {
  capabilityType: string;
  capabilityName: string;
  reason: string;
  candidates: RoutingCandidate[];
  needConfirmation: boolean;
}

export interface RoutingCandidate {
  capabilityId: string;
  capabilityName: string;
  type: string;
  score: number;
  toolIds: string[];
}
