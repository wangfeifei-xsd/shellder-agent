import { apiFetch, ApiError } from './api';

export interface LlmSettingsView {
  base_url: string;
  model: string;
  timeout_ms: number;
  max_tokens: number;
  chat_path: string;
  api_key: string | null;
  api_key_configured: boolean;
  enable_thinking: boolean;
}

export interface UpsertLlmSettingsInput {
  base_url?: string;
  model?: string;
  api_key?: string;
  timeout_ms?: number;
  max_tokens?: number;
  chat_path?: string;
  enable_thinking?: boolean;
}

export interface LlmTestResult {
  ok: boolean;
  model: string;
  base_url: string;
  elapsed_ms: number;
  message: string;
  error?: string;
}

const BASE = '/api/v1/settings';

export function getLlmSettings() {
  return apiFetch<LlmSettingsView>(`${BASE}/llm`);
}

export function updateLlmSettings(input: UpsertLlmSettingsInput) {
  return apiFetch<LlmSettingsView>(`${BASE}/llm`, { method: 'PUT', body: input });
}

export function testLlmConnection(input?: {
  base_url?: string;
  model?: string;
  api_key?: string;
  enable_thinking?: boolean;
}) {
  return apiFetch<LlmTestResult>(`${BASE}/llm/test`, { method: 'POST', body: input ?? {} });
}

export const LLM_ERROR_CODES = ['LLM_NOT_CONFIGURED', 'LLM_UPSTREAM_ERROR', 'LLM_TIMEOUT'] as const;

export function isLlmError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    LLM_ERROR_CODES.includes(err.code as (typeof LLM_ERROR_CODES)[number])
  );
}
