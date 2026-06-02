import { Citation } from './capability-result';

/** qa.dialogue.system 模板变量 */
export function buildQaDialogueSystemVariables(
  citations: Citation[],
  injectedContext?: string,
): Record<string, string> {
  const citationLines =
    citations.length > 0
      ? citations
          .slice(0, 6)
          .map(
            (c, i) =>
              `[${i + 1}] ${c.documentTitle ?? '未命名'} (score=${c.score?.toFixed(4) ?? 'n/a'})\n${c.content ?? ''}`,
          )
          .join('\n\n')
      : '（无召回命中）';

  const contextBlock = injectedContext?.trim()
    ? `\n\n## 注入上下文\n${injectedContext.trim()}`
    : '';

  return { citationLines, contextBlock };
}
