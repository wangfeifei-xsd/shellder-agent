import { createHash } from 'crypto';

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

export function sha256Content(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** 提取模板中的 {{var}} 占位符名 */
export function extractPlaceholders(content: string): string[] {
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    keys.add(m[1]);
  }
  return [...keys];
}

/** 解析 variable_schema.required；无 schema 时以占位符为准 */
export function resolveRequiredVariables(
  content: string,
  variableSchema: unknown,
): string[] {
  if (
    variableSchema &&
    typeof variableSchema === 'object' &&
    'required' in variableSchema &&
    Array.isArray((variableSchema as { required: unknown }).required)
  ) {
    return (variableSchema as { required: string[] }).required;
  }
  return extractPlaceholders(content);
}

/** Mustache 风格简单替换 {{key}} */
export function renderMustache(
  content: string,
  variables: Record<string, unknown>,
): string {
  return content.replace(PLACEHOLDER_RE, (_, key: string) => {
    const val = variables[key];
    if (val === undefined || val === null) {
      return '';
    }
    return typeof val === 'string' ? val : String(val);
  });
}
