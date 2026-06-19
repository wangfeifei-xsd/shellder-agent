import { CapabilityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  /** 模拟定向：跳过 Stage1 跨类型匹配，仅执行 Stage2 */
  @IsOptional()
  @IsEnum(CapabilityType)
  pinnedCapabilityType?: CapabilityType;
}

export interface RoutingTypeStage {
  reason: string;
  confidence: number;
  pinned: boolean;
}

export interface RoutingIntraStage {
  ruleId?: string;
  ruleName?: string;
  toolIds: string[];
  reason: string;
  toolKind?: string;
  signalToolCode?: string;
}

export interface RoutingTestResult {
  capabilityType: string;
  capabilityName: string;
  reason: string;
  candidates: RoutingCandidate[];
  needConfirmation: boolean;
  typeStage?: RoutingTypeStage;
  intraStage?: RoutingIntraStage;
}

export interface RoutingCandidate {
  capabilityId: string;
  capabilityName: string;
  type: string;
  score: number;
  toolIds: string[];
}

export interface CapabilityRouteResult {
  capabilityType: CapabilityType;
  capabilityName: string;
  reason: string;
  confidence: number;
  pinned: boolean;
  candidates: RoutingCandidate[];
}

export interface IntraCapabilityRouteResult {
  toolIds: string[];
  ruleId?: string;
  ruleName?: string;
  reason: string;
  needConfirmation: boolean;
  toolKind?: string;
  signalToolCode?: string;
}

export interface RouteFullOptions {
  pinnedCapabilityType?: CapabilityType;
  userId?: string;
  /** 显式启用/禁用 LLM Stage1；默认读租户 feature flag */
  enableLlmClassify?: boolean;
}

export class RoutingIntraTestDto {
  @IsString()
  tenantId!: string;

  @IsEnum(CapabilityType)
  capabilityType!: CapabilityType;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  input!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
