import { useEffect, useState } from 'react';
import type { CapabilityTypeKey } from './copilot';

const THINKING_START = '思考中...';

/** 后端曾推送的占位 delta，嵌入页应继续展示分阶段思考文案直至实质内容 */
const INTERIM_STREAM_TEXT = /^正在查询[….…]{0,3}\s*$/;

export function hasSubstantiveStreamText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !INTERIM_STREAM_TEXT.test(trimmed);
}

export function shouldIgnoreInterimStreamDelta(chunk: string, accumulated: string): boolean {
  if (accumulated.trim()) return false;
  return INTERIM_STREAM_TEXT.test(chunk.trim());
}

const PHASE2_OPTIONS = ['理解中…', '对齐语义…', '推理中…'] as const;

function pickPhase2Text(): string {
  return PHASE2_OPTIONS[Math.floor(Math.random() * PHASE2_OPTIONS.length)];
}

/** 按能力类型返回分阶段占位文案（delayMs 为相对起点的累计延迟） */
export function buildThinkingStatusPhases(
  capabilityType: CapabilityTypeKey | null,
): { delayMs: number; text: string }[] {
  const phase2 = pickPhase2Text();

  if (capabilityType === 'qa') {
    return [
      { delayMs: 0, text: THINKING_START },
      { delayMs: 3000, text: phase2 },
      { delayMs: 6000, text: '检索知识...' },
      { delayMs: 16000, text: '多模态对齐中…' },
    ];
  }

  if (capabilityType === 'query') {
    return [
      { delayMs: 0, text: THINKING_START },
      { delayMs: 3000, text: phase2 },
      { delayMs: 6000, text: '生成SQL…' },
      { delayMs: 16000, text: '合成响应中…' },
    ];
  }

  return [{ delayMs: 0, text: THINKING_START }];
}

/** 嵌入 Copilot 流式等待时的分阶段状态文案 */
export function useThinkingStatusText(
  active: boolean,
  capabilityType: CapabilityTypeKey | null,
): string {
  const [text, setText] = useState(THINKING_START);

  useEffect(() => {
    if (!active) {
      setText(THINKING_START);
      return;
    }

    const phases = buildThinkingStatusPhases(capabilityType);
    setText(phases[0]?.text ?? THINKING_START);

    const timers = phases.slice(1).map((phase) =>
      window.setTimeout(() => setText(phase.text), phase.delayMs),
    );

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [active, capabilityType]);

  return text;
}
