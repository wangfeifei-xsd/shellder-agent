import { IsEnum, IsOptional, IsString, IsArray } from 'class-validator';
import { ApprovalRiskLevel } from '@prisma/client';

export class CreateApprovalDto {
  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  initiatorId?: string;

  @IsOptional()
  @IsString()
  initiatorName?: string;

  @IsString()
  actionType: string;

  @IsOptional()
  @IsString()
  actionSummary?: string;

  @IsOptional()
  @IsEnum(ApprovalRiskLevel)
  riskLevel?: ApprovalRiskLevel;

  @IsOptional()
  @IsString()
  impactScope?: string;

  @IsOptional()
  @IsArray()
  toolIds?: string[];

  @IsOptional()
  requestContext?: Record<string, unknown>;
}
