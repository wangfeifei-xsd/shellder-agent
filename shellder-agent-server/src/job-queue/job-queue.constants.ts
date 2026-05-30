/** BullMQ 队列名（与 shellder-job-worker queue.constants 保持一致） */
export const TASK_QUEUE = 'shellder.task';
export const TASK_TIMEOUT_QUEUE = 'shellder.task-timeout';
export const NOTIFICATION_QUEUE = 'shellder.notification';
export const DOCUMENT_PROCESSING_QUEUE = 'shellder.document-processing';

export type NotificationEventType =
  | 'task_completed'
  | 'approval_pending'
  | 'error';

export interface NotificationJobPayload {
  type: NotificationEventType;
  tenantId: string;
  /** 对应 notification_template.name */
  templateKey: string;
  variables: Record<string, string>;
  taskId?: string;
  approvalId?: string;
}

export type DocumentProcessingOperation = 'compile_and_embed' | 'embed_only';

export interface DocumentProcessingJobPayload {
  jobRecordId: string;
  tenantId: string;
  layer: string;
  inputPath: string;
  outputPath?: string;
  operation: DocumentProcessingOperation;
  idempotencyKey: string;
}

/** 默认模板 name（与 seed.sql 一致） */
export const DEFAULT_NOTIFICATION_TEMPLATE_KEYS: Record<
  NotificationEventType,
  string
> = {
  task_completed: '默认任务完成通知模板',
  approval_pending: '默认审批通知模板',
  error: '默认异常通知模板',
};

/** NotificationTemplateType 映射 */
export const NOTIFICATION_TYPE_TO_TEMPLATE: Record<
  NotificationEventType,
  'task_complete' | 'approval' | 'exception'
> = {
  task_completed: 'task_complete',
  approval_pending: 'approval',
  error: 'exception',
};
