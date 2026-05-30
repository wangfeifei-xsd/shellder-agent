import { Approval } from '@prisma/client';

export function toApprovalView(approval: Approval) {
  return {
    id: approval.id,
    tenantId: approval.tenantId,
    sessionId: approval.sessionId,
    taskId: approval.taskId,
    messageId: approval.messageId,
    initiatorId: approval.initiatorId,
    initiatorName: approval.initiatorName,
    actionType: approval.actionType,
    actionSummary: approval.actionSummary,
    riskLevel: approval.riskLevel,
    impactScope: approval.impactScope,
    toolIds: (approval.toolIds ?? []) as string[],
    requestContext: (approval.requestContext ?? {}) as Record<string, unknown>,
    status: approval.status,
    reviewerId: approval.reviewerId,
    reviewerName: approval.reviewerName,
    opinion: approval.opinion,
    reviewedAt: approval.reviewedAt,
    expiredAt: approval.expiredAt,
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
  };
}
