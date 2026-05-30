/** 将 {{var}} 占位符替换为 variables 中的值 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    return variables[key] ?? '';
  });
}
