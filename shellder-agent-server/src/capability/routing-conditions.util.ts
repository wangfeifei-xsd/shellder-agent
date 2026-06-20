/** 路由规则 conditions DSL 结构（与 routing-engine 一致） */
export interface RoutingConditionsShape {
  keywords?: string[];
  patterns?: string[];
  intents?: string[];
  toolKind?: 'http_query' | 'action' | 'notification';
  minScore?: number;
}

export interface RoutingConditionsMatchDetail {
  score: number;
  hit: boolean;
  matchedKeywords: string[];
  matchedPatterns: string[];
  matchedIntents: string[];
  invalidPatterns: string[];
}

/** 与 RoutingEngineService.calculateScore 一致的匹配算法，并返回命中明细 */
export function evaluateRoutingConditions(
  input: string,
  conditions: RoutingConditionsShape,
): RoutingConditionsMatchDetail {
  const matchedKeywords: string[] = [];
  const matchedPatterns: string[] = [];
  const matchedIntents: string[] = [];
  const invalidPatterns: string[] = [];
  let score = 0;
  const lowerInput = input.toLowerCase();

  if (conditions.keywords && conditions.keywords.length > 0) {
    for (const kw of conditions.keywords) {
      const trimmed = kw.trim();
      if (!trimmed) continue;
      if (lowerInput.includes(trimmed.toLowerCase())) {
        score += 10;
        matchedKeywords.push(trimmed);
      }
    }
  }

  if (conditions.patterns && conditions.patterns.length > 0) {
    for (const pattern of conditions.patterns) {
      const trimmed = pattern.trim();
      if (!trimmed) continue;
      try {
        const re = new RegExp(trimmed, 'i');
        if (re.test(input)) {
          score += 20;
          matchedPatterns.push(trimmed);
        }
      } catch {
        invalidPatterns.push(trimmed);
      }
    }
  }

  if (conditions.intents && conditions.intents.length > 0) {
    for (const intent of conditions.intents) {
      const trimmed = intent.trim();
      if (!trimmed) continue;
      if (lowerInput.includes(trimmed.toLowerCase())) {
        score += 15;
        matchedIntents.push(trimmed);
      }
    }
  }

  return {
    score,
    hit: score > 0,
    matchedKeywords,
    matchedPatterns,
    matchedIntents,
    invalidPatterns,
  };
}

/** 从 API/DB 原始 JSON 读取 conditions */
export function readRoutingConditions(raw: unknown): RoutingConditionsShape {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as RoutingConditionsShape;
  }
  return {};
}
