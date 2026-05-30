export interface StepExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  needConfirmation?: boolean;
  approvalId?: string;
  toolName?: string;
  durationMs?: number;
}

export interface CapabilityExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  needConfirmation?: boolean;
  approvalId?: string;
}

export interface PrepareTaskResult {
  taskId: string;
  stepCount: number;
  createdSteps: number;
}
