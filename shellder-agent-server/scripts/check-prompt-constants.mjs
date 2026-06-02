/**
 * 轻量防回归：禁止新增 *.prompt.ts 与 export const *_SYSTEM_PROMPT 模式。
 * 本地：npm run check:prompt-constants（在 shellder-agent-server 目录）
 * 白名单：遗留 er-diagram.prompt.ts 仅允许 schema 工具函数，不得含模板字面量。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..', 'src');

/** 允许保留的 *.prompt.ts（不得再写入 LLM 模板正文） */
const PROMPT_FILE_WHITELIST = new Set(['connector/er-diagram.prompt.ts']);

const SYSTEM_PROMPT_EXPORT = /export\s+const\s+[A-Z0-9_]*SYSTEM_PROMPT\b/;

function walkTsFiles(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, files);
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function relFromSrc(abs) {
  return path.relative(SRC_ROOT, abs).replace(/\\/g, '/');
}

function main() {
  const errors = [];

  if (!fs.existsSync(SRC_ROOT)) {
    console.error(`src 目录不存在: ${SRC_ROOT}`);
    process.exit(1);
  }

  for (const file of walkTsFiles(SRC_ROOT)) {
    const rel = relFromSrc(file);
    const base = path.basename(file);

    if (base.endsWith('.prompt.ts') && !PROMPT_FILE_WHITELIST.has(rel)) {
      errors.push(
        `禁止新建 *.prompt.ts: ${rel}（白名单仅 ${[...PROMPT_FILE_WHITELIST].join(', ')}）`,
      );
    }

    const content = fs.readFileSync(file, 'utf8');
    if (SYSTEM_PROMPT_EXPORT.test(content)) {
      errors.push(`禁止 export const *_SYSTEM_PROMPT: ${rel}`);
    }
  }

  if (errors.length > 0) {
    console.error('check-prompt-constants 失败:\n');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    console.error('\n见 project-analysis/implementation-constraints.md §1D');
    process.exit(1);
  }

  console.log('check-prompt-constants: OK');
}

main();
