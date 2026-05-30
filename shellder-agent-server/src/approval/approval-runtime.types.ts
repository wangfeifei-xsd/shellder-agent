/** 确认操作发起方（管理端用户 / OpenAPI 应用 / Copilot） */
export type ConfirmationActorType = 'user' | 'openapi_app' | 'copilot';

export interface ConfirmationActor {
  id: string;
  name?: string;
  type: ConfirmationActorType;
}

export type ConfirmationAction = 'approve' | 'reject';

export interface SubmitConfirmationInput {
  approvalId: string;
  action: ConfirmationAction;
  opinion?: string;
  actor: ConfirmationActor;
  /** sync：等待 Runtime 恢复完成；async：后台恢复并通过 SSE 推送 */
  executionMode?: 'sync' | 'async';
  ip?: string;
  requestId?: string;
}
