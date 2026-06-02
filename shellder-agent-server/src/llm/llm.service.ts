import { HttpException, Injectable, Logger } from '@nestjs/common';
import { LlmConfigService, LlmEffectiveConfig } from './llm-config.service';
import { llmNotConfigured, llmTimeout, llmUpstreamError } from './llm.errors';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  model: string;
  elapsedMs: number;
}

export interface StreamDeltaCallback {
  (delta: string): void | Promise<void>;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly configService: LlmConfigService) {}

  async assertConfigured(): Promise<LlmEffectiveConfig> {
    const config = await this.configService.getEffectiveConfig();
    if (!this.configService.isConfigured(config)) {
      throw llmNotConfigured();
    }
    return config;
  }

  /** 极小 Chat 探测（管理端测试 / 可选覆盖参数） */
  async testConnection(overrides?: {
    base_url?: string;
    model?: string;
    api_key?: string;
    enable_thinking?: boolean;
  }): Promise<{
    ok: boolean;
    model: string;
    base_url: string;
    elapsed_ms: number;
    message: string;
    error?: string;
  }> {
    const stored = await this.configService.getEffectiveConfig();
    const config: LlmEffectiveConfig = {
      ...stored,
      baseUrl: overrides?.base_url?.trim() || stored.baseUrl,
      model: overrides?.model?.trim() || stored.model,
      apiKey:
        overrides?.api_key !== undefined
          ? overrides.api_key.trim() || null
          : stored.apiKey,
      enableThinking:
        overrides?.enable_thinking !== undefined
          ? overrides.enable_thinking
          : stored.enableThinking,
    };

    if (!this.configService.isConfigured(config)) {
      return {
        ok: false,
        model: config.model,
        base_url: config.baseUrl,
        elapsed_ms: 0,
        message: 'LLM 未完整配置',
        error: 'LLM_NOT_CONFIGURED',
      };
    }

    const chatUrl = this.buildChatUrl(config);
    const start = Date.now();
    try {
      const result = await this.chatCompletion(
        config,
        [{ role: 'user', content: 'ping' }],
        { maxTokens: 16 },
      );
      return {
        ok: true,
        model: result.model,
        base_url: config.baseUrl,
        elapsed_ms: result.elapsedMs,
        message: result.text.slice(0, 200) || '连接成功',
      };
    } catch (err) {
      const elapsed_ms = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`LLM 连通性测试失败：${errorMsg}（${chatUrl}）`);
      return {
        ok: false,
        model: config.model,
        base_url: config.baseUrl,
        elapsed_ms,
        message: '连接失败',
        error: `${errorMsg}（请求 ${chatUrl}）`,
      };
    }
  }

  /** 非流式 Chat Completions */
  async chatCompletion(
    configOrMessages: LlmEffectiveConfig | ChatMessage[],
    messagesOrOpts?: ChatMessage[] | { maxTokens?: number },
    opts?: { maxTokens?: number },
  ): Promise<ChatCompletionResult> {
    let config: LlmEffectiveConfig;
    let messages: ChatMessage[];
    let maxTokens: number | undefined;

    if (Array.isArray(configOrMessages)) {
      config = await this.assertConfigured();
      messages = configOrMessages;
      maxTokens = (messagesOrOpts as { maxTokens?: number } | undefined)?.maxTokens;
    } else {
      config = configOrMessages;
      messages = messagesOrOpts as ChatMessage[];
      maxTokens = opts?.maxTokens;
    }

    const url = this.buildChatUrl(config);
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify(
          this.buildChatRequestBody(config, messages, {
            maxTokens: maxTokens ?? config.maxTokens,
            stream: false,
          }),
        ),
        signal: controller.signal,
      });

      const { body, rawText } = await this.readUpstreamBody(res);

      if (!res.ok) {
        throw llmUpstreamError(this.formatUpstreamError(res, body, rawText));
      }

      const choices = body.choices as
        | { message?: { content?: string } }[]
        | undefined;
      const text = choices?.[0]?.message?.content ?? '';
      return { text, model: config.model, elapsedMs: Date.now() - start };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw llmTimeout(config.timeoutMs);
      }
      if (err instanceof HttpException) throw err;
      throw llmUpstreamError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  /** 流式 Chat Completions，逐 delta 回调 */
  async chatCompletionStream(
    messages: ChatMessage[],
    onDelta: StreamDeltaCallback,
  ): Promise<{ text: string; model: string; elapsedMs: number }> {
    const config = await this.assertConfigured();
    const url = this.buildChatUrl(config);
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let fullText = '';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify(
          this.buildChatRequestBody(config, messages, {
            maxTokens: config.maxTokens,
            stream: true,
          }),
        ),
        signal: controller.signal,
      });

      if (!res.ok) {
        const { body, rawText } = await this.readUpstreamBody(res);
        throw llmUpstreamError(this.formatUpstreamError(res, body, rawText));
      }

      if (!res.body) {
        throw llmUpstreamError('上游未返回流式响应体');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              await onDelta(delta);
            }
          } catch {
            // 忽略非 JSON 行
          }
        }
      }

      return { text: fullText, model: config.model, elapsedMs: Date.now() - start };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw llmTimeout(config.timeoutMs);
      }
      if (err instanceof HttpException) throw err;
      throw llmUpstreamError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  private buildChatRequestBody(
    config: LlmEffectiveConfig,
    messages: ChatMessage[],
    opts: { maxTokens: number; stream: boolean },
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      max_tokens: opts.maxTokens,
      stream: opts.stream,
    };
    if (config.enableThinking) {
      body.enable_thinking = true;
    }
    return body;
  }

  private buildChatUrl(config: LlmEffectiveConfig): string {
    const base = config.baseUrl.replace(/\/+$/, '');
    let path = (config.chatPath || 'chat/completions').replace(/^\/+/, '');
    // Base URL 已含 /v1 时，避免拼成 .../v1/v1/chat/completions 导致 404
    if (/\/v1$/i.test(base) && path.toLowerCase().startsWith('v1/')) {
      path = path.replace(/^v1\//i, '');
    }
    return `${base}/${path}`;
  }

  private async readUpstreamBody(res: Response): Promise<{
    body: Record<string, unknown>;
    rawText: string;
  }> {
    const rawText = await res.text();
    if (!rawText.trim()) {
      return { body: {}, rawText };
    }
    try {
      return { body: JSON.parse(rawText) as Record<string, unknown>, rawText };
    } catch {
      return { body: {}, rawText };
    }
  }

  private formatUpstreamError(
    res: Response,
    body: Record<string, unknown>,
    rawText: string,
  ): string {
    const errObj = body.error as { message?: string } | undefined;
    if (errObj?.message) {
      return `HTTP ${res.status}：${errObj.message}`;
    }
    const snippet = rawText.trim().slice(0, 240);
    if (snippet) {
      return `HTTP ${res.status}：${snippet}`;
    }
    return `HTTP ${res.status}`;
  }

  private buildHeaders(config: LlmEffectiveConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
    return headers;
  }
}
