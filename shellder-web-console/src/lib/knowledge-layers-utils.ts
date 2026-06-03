/** 每个文件最多 Unicode 字符数（码点），raw 层超出则拆成 base-1、base-2 … */
export const UPLOAD_CHUNK_CHARS = 2500;

export const SCHEMA_CREATE_TEMPLATE = `# 知识库维护约定（AGENTS）

本文供编译 / Lint 等任务引用，请按团队实际情况修改。

## 目录结构

- **raw/**：原始素材（笔记、剪藏等）
- **wiki/**：编译后的结构化条目
- **schema/**：规范与本文件

## 命名与格式

- Markdown，文件名建议小写；常用约定文件名：\`AGENTS.md\`
- （在此补充你们的命名规则）

## 禁止事项

- （例如：禁止在正文存放明文密钥、禁止删除他人条目等）

## 写作与链接风格

- （在此补充术语、内部链接格式等）
`;

export function defaultSchemaRelativePath(prefixDir: string): string {
  const base = prefixDir.replace(/\/$/, '');
  return base ? `${base}/AGENTS.md` : 'AGENTS.md';
}

export function entryApiPath(row: { path: string }): string {
  return row.path.replace(/\/$/, '');
}

export function splitTextByMaxChars(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let buf = '';
  let n = 0;
  for (const ch of text) {
    if (n >= maxChars) {
      chunks.push(buf);
      buf = '';
      n = 0;
    }
    buf += ch;
    n++;
  }
  if (buf.length) chunks.push(buf);
  return chunks.length ? chunks : [''];
}

export function expandUploadPaths(rel: string, partCount: number): string[] {
  if (partCount <= 1) return [rel];
  const lastSlash = rel.lastIndexOf('/');
  const dir = lastSlash >= 0 ? rel.slice(0, lastSlash + 1) : '';
  const file = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
  const dot = file.lastIndexOf('.');
  const hasExt = dot > 0 && dot < file.length - 1;
  const base = hasExt ? file.slice(0, dot) : file;
  const ext = hasExt ? file.slice(dot) : '';
  return Array.from({ length: partCount }, (_, idx) => `${dir}${base}-${idx + 1}${ext}`);
}

export function findHeadingLineIndex(content: string, headingPath: string): number {
  const parts = headingPath
    .split(/\s*>\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  for (let pi = parts.length - 1; pi >= 0; pi--) {
    const title = parts[pi];
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^#{1,6}\\s+${esc}\\s*$`);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) return i;
    }
  }
  return -1;
}

export function lineCharRange(content: string, lineIndex: number): { start: number; end: number } {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  for (let i = 0; i < lineIndex; i++) start += lines[i].length + 1;
  const line = lines[lineIndex] ?? '';
  return { start, end: start + line.length };
}
