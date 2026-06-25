import { Injectable, Logger } from '@nestjs/common';
import { applicationProperties } from '@shellder/config';
import type {
  CapabilityExecutionResult,
  PrepareTaskResult,
  StepExecutionResult,
} from './task-execution.types';

export type {
  CapabilityExecutionResult,
  PrepareTaskResult,
  StepExecutionResult,
} from './task-execution.types';

@Injectable()
export class TaskExecutionClient {
  private readonly logger = new Logger(TaskExecutionClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    const cfg = applicationProperties.get();
    this.baseUrl = cfg.services.agentServer.internalUrl;
    this.token = cfg.auth.worker.internalToken;
  }

  async prepareTask(taskId: string): Promise<PrepareTaskResult> {
    return this.post<PrepareTaskResult>(`/internal/tasks/${taskId}/prepare`);
  }

  async executeStep(taskId: string, stepId: string): Promise<StepExecutionResult> {
    return this.post<StepExecutionResult>(
      `/internal/tasks/${taskId}/steps/${stepId}/execute`,
    );
  }

  async executeCapability(taskId: string): Promise<CapabilityExecutionResult> {
    return this.post<CapabilityExecutionResult>(
      `/internal/tasks/${taskId}/execute-capability`,
    );
  }

  async notifyTaskCompleted(taskId: string): Promise<void> {
    await this.post(`/internal/tasks/${taskId}/lifecycle/completed`);
  }

  async notifyTaskFailed(taskId: string, errorMessage?: string): Promise<void> {
    await this.post(`/internal/tasks/${taskId}/lifecycle/failed`, {
      errorMessage,
    });
  }

  private async post<T = Record<string, unknown>>(
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.token) {
      throw new Error(
        'WORKER_INTERNAL_TOKEN 未配置，无法调用 agent-server 内网接口',
      );
    }

    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`POST ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Token': this.token,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const responseBody = await this.readBody(res);

    if (!res.ok) {
      const message =
        typeof responseBody === 'object' &&
        responseBody !== null &&
        'message' in responseBody
          ? String((responseBody as { message: unknown }).message)
          : `HTTP ${res.status}`;
      throw new Error(`内网任务执行失败 (${path}): ${message}`);
    }

    return responseBody as T;
  }

  private async readBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}
