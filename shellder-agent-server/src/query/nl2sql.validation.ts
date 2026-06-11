import { BadRequestException } from '@nestjs/common';
import { ErDiagram } from '../connector/connector-schema.types';

export interface Nl2SqlParsedOutput {
  sql: string;
  referencedTables: string[];
  params: Record<string, unknown>;
  /** LLM 从用户问题中识别到的实体名/筛选值（由 LLM 输出，用于正向校验） */
  extractedLiterals?: string[];
}

/** 占位符/说明性 param 值（非用户问题中的真实取值） */
const PLACEHOLDER_PARAM_PATTERNS: RegExp[] = [
  /^请/,
  /请替换/,
  /^实际/u,
  /^示例/u,
  /^example$/i,
  /^placeholder$/i,
  /^待填/u,
  /^TBD$/i,
  /^(xxx|XXX)$/,
  /^企业ID$/,
  /^用户ID$/,
  /^部门ID$/,
  /^组织ID$/,
  /^.+ID$/, // 「企业ID」类说明文字
];

const NAME_LIKE_SUFFIXES = new Set(['name', 'title', 'label', 'nm']);
const ID_LIKE_SUFFIXES = new Set(['id', 'uuid', 'pk']);

export interface Nl2SqlSemanticValidationInput {
  parsed: Nl2SqlParsedOutput;
  er: ErDiagram;
  scopeContext?: string;
  userMessage: string;
}

/** NL2SQL 生成后的语义校验（字段存在性、范围列、占位参数、参数-列一致性、实体名一致性、参数来源） */
export function assertNl2SqlSemantics(input: Nl2SqlSemanticValidationInput): void {
  assertColumnsInEr(input.parsed, input.er);
  assertNoScopeColumnInSql(input.parsed, input.er, input.scopeContext);
  assertParamsNotPlaceholder(input.parsed);
  assertParamColumnConsistency(input.parsed, input.er);
  assertParamsReflectUserLiterals(input.parsed);
  assertParamsOriginateFromUser(input.parsed, input.userMessage);
}

function isActiveScopeContext(scopeContext?: string): boolean {
  const text = scopeContext?.trim();
  return !!text && !text.includes('未配置业务数据范围');
}

/** ⓪ SQL 引用的字段必须存在于裁剪后 ER 图中（拦截 is_deleted/status 等幻觉字段） */
function assertColumnsInEr(parsed: Nl2SqlParsedOutput, er: ErDiagram): void {
  const tableColumns = new Map<string, Set<string>>();
  const allColumns = new Set<string>();
  for (const table of er.tables ?? []) {
    const cols = new Set((table.columns ?? []).map((c) => c.name.toLowerCase()));
    tableColumns.set(table.name.toLowerCase(), cols);
    for (const c of cols) allColumns.add(c);
  }
  const tableNames = new Set(tableColumns.keys());
  if (tableNames.size === 0) return;

  const tokens = tokenizeSql(parsed.sql);
  const aliasToTable = buildAliasToTableMap(parsed.sql, parsed.referencedTables);

  // 第一遍：收集不应按物理列校验的标识符（函数名、表/列别名、CTE 名、表位置名）
  const derivedNames = new Set<string>();
  const skipIdx = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type !== 'ident') continue;
    const lower = tk.value.toLowerCase();
    const prev = tokens[i - 1];
    const next = tokens[i + 1];

    if (SQL_KEYWORDS.has(lower)) {
      skipIdx.add(i);
      continue;
    }
    // 函数调用：标识符后紧跟 (
    if (next?.type === 'punct' && next.value === '(') {
      skipIdx.add(i);
      continue;
    }
    // CTE 名：`WITH x AS (`
    const afterAs = tokens[i + 2];
    if (
      next?.type === 'ident' &&
      next.value.toLowerCase() === 'as' &&
      afterAs?.type === 'punct' &&
      afterAs.value === '('
    ) {
      derivedNames.add(lower);
      skipIdx.add(i);
      continue;
    }
    if (prev) {
      const prevKeyword =
        prev.type === 'ident' ? prev.value.toLowerCase() : '';
      // AS 别名 / CASE...END 后的隐式别名
      if (prevKeyword === 'as' || prevKeyword === 'end') {
        derivedNames.add(lower);
        skipIdx.add(i);
        continue;
      }
      // FROM/JOIN 后是表名（含 CTE 引用），不按列校验
      if (prevKeyword === 'from' || prevKeyword === 'join') {
        skipIdx.add(i);
        continue;
      }
      // 隐式别名：紧跟 )、限定列、字面量或非关键字标识符之后（如 `users u`、`COUNT(*) cnt`）
      if (
        (prev.type === 'punct' && prev.value === ')') ||
        prev.type === 'qualified' ||
        prev.type === 'literal' ||
        (prev.type === 'ident' && !SQL_KEYWORDS.has(prevKeyword))
      ) {
        derivedNames.add(lower);
        skipIdx.add(i);
        continue;
      }
    }
  }

  // 第二遍：逐一校验列引用
  const violations = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];

    if (tk.type === 'qualified') {
      const qualifier = tk.qualifier.toLowerCase();
      const column = tk.column.toLowerCase();
      if (column === '*') continue;
      const tableName =
        aliasToTable.get(qualifier)?.toLowerCase() ??
        (tableNames.has(qualifier) ? qualifier : undefined);
      if (!tableName) continue; // 子查询/CTE 别名，无法静态对照物理表
      const cols = tableColumns.get(tableName);
      if (cols && !cols.has(column)) {
        violations.add(
          `表「${tableName}」中不存在字段「${tk.column}」（该表可用字段：${[...cols].join(', ')}）`,
        );
      }
      continue;
    }

    if (tk.type !== 'ident' || skipIdx.has(i)) continue;
    const lower = tk.value.toLowerCase();
    if (derivedNames.has(lower)) continue;
    if (tableNames.has(lower)) continue;
    if (allColumns.has(lower)) continue;
    violations.add(`字段「${tk.value}」不存在于 ER 关系图的任何表中`);
  }

  if (violations.size > 0) {
    throw new BadRequestException({
      code: 'NL2SQL_COLUMN_NOT_IN_ER',
      message:
        `SQL 引用了 ER 关系图中不存在的字段：${[...violations].join('；')}。` +
        `只能使用 ER 图各表 columns 中列出的字段，禁止编造字段；若缺少所需字段，请去掉对应条件或改用已有字段`,
    });
  }
}

/** ① 数据范围列不得出现在 SQL WHERE 中（执行层自动注入） */
function assertNoScopeColumnInSql(
  parsed: Nl2SqlParsedOutput,
  er: ErDiagram,
  scopeContext?: string,
): void {
  if (!isActiveScopeContext(scopeContext)) return;

  const lower = parsed.sql.toLowerCase();
  const whereIdx = lower.search(/\bwhere\b/);
  if (whereIdx < 0) return;
  const afterWhere = lower.slice(whereIdx);
  const fullSql = parsed.sql;

  for (const table of er.tables ?? []) {
    const ds = table.dataScope;
    if (!ds) continue;

    if (ds.scopeColumn?.trim()) {
      const col = ds.scopeColumn.trim();
      if (
        columnInWhere(fullSql, afterWhere, table.name, col, parsed.referencedTables)
      ) {
        throw new BadRequestException({
          code: 'NL2SQL_SCOPE_COLUMN_FORBIDDEN',
          message: `SQL 不得手写表「${table.name}」的范围列「${col}」过滤条件，该列由执行层按 scopeList 自动注入；请改用业务列（如名称列）或 JOIN 其他表过滤`,
        });
      }
    }

    if (ds.userColumn?.trim()) {
      const col = ds.userColumn.trim();
      if (
        columnInWhere(fullSql, afterWhere, table.name, col, parsed.referencedTables)
      ) {
        throw new BadRequestException({
          code: 'NL2SQL_SCOPE_COLUMN_FORBIDDEN',
          message: `SQL 不得手写表「${table.name}」的用户列「${col}」过滤条件，该列由执行层按 externalUserId 自动注入`,
        });
      }
    }
  }
}

/** ② params 不得为占位符/说明文字；SQL 中每个 :param 须有真实取值 */
function assertParamsNotPlaceholder(parsed: Nl2SqlParsedOutput): void {
  const paramNamesInSql = extractSqlParamNames(parsed.sql);
  const params = parsed.params ?? {};

  for (const name of paramNamesInSql) {
    if (!(name in params)) {
      throw new BadRequestException({
        code: 'NL2SQL_PARAM_MISSING',
        message: `SQL 使用了命名参数 :${name}，但 params 中缺少对应取值`,
      });
    }
    if (isPlaceholderParamValue(params[name])) {
      throw new BadRequestException({
        code: 'NL2SQL_PARAM_PLACEHOLDER',
        message: `params.${name} 为占位说明「${String(params[name])}」，须从用户问题提取真实值`,
      });
    }
  }

  for (const [key, value] of Object.entries(params)) {
    if (paramNamesInSql.includes(key) && isPlaceholderParamValue(value)) {
      throw new BadRequestException({
        code: 'NL2SQL_PARAM_PLACEHOLDER',
        message: `params.${key} 为占位说明「${String(value)}」，须从用户问题提取真实值`,
      });
    }
  }
}

/** ③ 参数名与绑定列语义一致（如 :enterprise_name 不得绑定 enterprise_id） */
function assertParamColumnConsistency(
  parsed: Nl2SqlParsedOutput,
  er: ErDiagram,
): void {
  const bindings = extractParamColumnBindings(parsed.sql);
  const columnTypes = buildColumnTypeIndex(er);
  const aliasToTable = buildAliasToTableMap(parsed.sql, parsed.referencedTables);

  for (const binding of bindings) {
    assertSuffixAlignment(binding.paramName, binding.columnName);

    const paramValue = parsed.params?.[binding.paramName];
    const colType = resolveColumnType(
      columnTypes,
      binding,
      aliasToTable,
    );

    if (
      colType &&
      isNumericColumnType(colType) &&
      typeof paramValue === 'string' &&
      looksLikeNonNumericString(paramValue)
    ) {
      throw new BadRequestException({
        code: 'NL2SQL_PARAM_COLUMN_MISMATCH',
        message: `参数 :${binding.paramName}（值「${paramValue}」）绑定到了数值/ID 列「${binding.columnName}」，类型不匹配；请改用名称类列或修正 params`,
      });
    }
  }
}

/** ④ LLM 识别的实体名须出现在 params 中（正向校验） */
function assertParamsReflectUserLiterals(
  parsed: Nl2SqlParsedOutput,
): void {
  const literals = parsed.extractedLiterals ?? [];
  if (literals.length === 0) return;

  const paramValues = Object.values(parsed.params ?? {})
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim());

  if (paramValues.length === 0) {
    throw new BadRequestException({
      code: 'NL2SQL_PARAM_LITERAL_MISSING',
      message: `LLM 识别出用户问题含实体名「${literals.join('、')}」，但 params 未提供对应字符串取值`,
    });
  }

  for (const lit of literals) {
    const found = paramValues.some((v) => v.includes(lit) || lit.includes(v));
    if (!found) {
      throw new BadRequestException({
        code: 'NL2SQL_PARAM_LITERAL_MISSING',
        message: `LLM 识别的实体名「${lit}」未出现在 params 中，请确保 extractedLiterals 与 params 保持一致`,
      });
    }
  }
}

/** ⑤ params 中的字符串值须能在用户问题中找到来源（反向校验） */
function assertParamsOriginateFromUser(
  parsed: Nl2SqlParsedOutput,
  userMessage: string,
): void {
  const msg = userMessage.toLowerCase();

  for (const [key, value] of Object.entries(parsed.params ?? {})) {
    if (typeof value !== 'string') continue;
    const v = value.trim();
    if (!v || v.length < 2) continue;

    const vLower = v.toLowerCase();
    if (!msg.includes(vLower) && !fuzzyContains(msg, vLower)) {
      throw new BadRequestException({
        code: 'NL2SQL_PARAM_NOT_FROM_USER',
        message: `params.${key}（值「${v}」）无法在用户问题中找到来源，params 取值须来自用户原始表述`,
      });
    }
  }
}

/** 模糊包含：允许用户消息中的值与 param 值存在子串关系 */
function fuzzyContains(message: string, value: string): boolean {
  if (value.length < 2) return false;
  return message.includes(value) || value.includes(message);
}

// ── helpers ─────────────────────────────────────────────

/** MySQL 关键字/保留字（小写）。命中者不按物理列校验，仅损失召回不产生误报 */
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'exists', 'between',
  'like', 'rlike', 'regexp', 'is', 'null', 'as', 'on', 'using', 'join',
  'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural',
  'straight_join', 'group', 'by', 'order', 'having', 'limit', 'offset',
  'asc', 'desc', 'distinct', 'distinctrow', 'union', 'all', 'any', 'some',
  'case', 'when', 'then', 'else', 'end', 'with', 'recursive', 'interval',
  'true', 'false', 'unknown', 'div', 'mod', 'xor', 'binary', 'collate',
  'escape', 'separator', 'partition', 'over', 'window', 'rows', 'range',
  'unbounded', 'preceding', 'following', 'current', 'row', 'ties', 'others',
  'exclude', 'groups', 'for', 'dual', 'if',
  'year', 'month', 'day', 'week', 'quarter', 'hour', 'minute', 'second',
  'microsecond', 'year_month', 'day_hour', 'day_minute', 'day_second',
  'hour_minute', 'hour_second', 'minute_second',
  'current_date', 'current_time', 'current_timestamp', 'localtime',
  'localtimestamp', 'utc_date', 'utc_time', 'utc_timestamp', 'sysdate',
]);

type SqlToken =
  | { type: 'ident'; value: string }
  | { type: 'qualified'; qualifier: string; column: string }
  | { type: 'literal' }
  | { type: 'param'; value: string }
  | { type: 'punct'; value: string };

/** 轻量 SQL 词法切分：跳过字符串/数字/注释/命名参数，识别裸标识符与 a.b 限定列 */
function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const n = sql.length;
  let i = 0;

  const readIdentifier = (): string | undefined => {
    if (sql[i] === '`') {
      const end = sql.indexOf('`', i + 1);
      if (end < 0) {
        i = n;
        return undefined;
      }
      const name = sql.slice(i + 1, end);
      i = end + 1;
      return name;
    }
    if (/[a-zA-Z_]/.test(sql[i] ?? '')) {
      const start = i;
      while (i < n && /[\w$]/.test(sql[i])) i++;
      return sql.slice(start, i);
    }
    return undefined;
  };

  while (i < n) {
    const ch = sql[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '#') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '\\') {
          i += 2;
          continue;
        }
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      tokens.push({ type: 'literal' });
      continue;
    }
    if (ch === ':' && /[a-zA-Z_]/.test(sql[i + 1] ?? '')) {
      i++;
      const start = i;
      while (i < n && /\w/.test(sql[i])) i++;
      tokens.push({ type: 'param', value: sql.slice(start, i) });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      while (i < n && /[\w.]/.test(sql[i])) i++;
      tokens.push({ type: 'literal' });
      continue;
    }
    if (ch === '`' || /[a-zA-Z_]/.test(ch)) {
      const first = readIdentifier();
      if (first === undefined) continue;
      // 探测 a.b / a.b.c（取末两段）/ a.*
      const parts = [first];
      let star = false;
      while (true) {
        let j = i;
        while (j < n && /\s/.test(sql[j])) j++;
        if (sql[j] !== '.') break;
        j++;
        while (j < n && /\s/.test(sql[j])) j++;
        if (sql[j] === '*') {
          i = j + 1;
          star = true;
          break;
        }
        i = j;
        const next = readIdentifier();
        if (next === undefined) break;
        parts.push(next);
      }
      if (star) {
        tokens.push({
          type: 'qualified',
          qualifier: parts[parts.length - 1],
          column: '*',
        });
      } else if (parts.length >= 2) {
        tokens.push({
          type: 'qualified',
          qualifier: parts[parts.length - 2],
          column: parts[parts.length - 1],
        });
      } else {
        tokens.push({ type: 'ident', value: first });
      }
      continue;
    }
    tokens.push({ type: 'punct', value: ch });
    i++;
  }
  return tokens;
}

function isPlaceholderParamValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_PARAM_PATTERNS.some((re) => re.test(trimmed));
}

function extractSqlParamNames(sql: string): string[] {
  const names = new Set<string>();
  const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    names.add(m[1]);
  }
  return [...names];
}

interface ParamColumnBinding {
  tableAlias?: string;
  columnName: string;
  paramName: string;
}

function extractParamColumnBindings(sql: string): ParamColumnBinding[] {
  const bindings: ParamColumnBinding[] = [];
  const forward =
    /(?:\b([a-zA-Z_][\w]*)\s*\.\s*)?([a-zA-Z_][\w]*)\s*(?:=|(?:NOT\s+)?LIKE)\s*:([a-zA-Z_][\w]*)/gi;
  const reverse =
    /:([a-zA-Z_][\w]*)\s*(?:=|(?:NOT\s+)?LIKE)\s*(?:\b([a-zA-Z_][\w]*)\s*\.\s*)?([a-zA-Z_][\w]*)/gi;

  let m: RegExpExecArray | null;
  while ((m = forward.exec(sql)) !== null) {
    bindings.push({
      tableAlias: m[1] || undefined,
      columnName: m[2],
      paramName: m[3],
    });
  }
  while ((m = reverse.exec(sql)) !== null) {
    bindings.push({
      tableAlias: m[2] || undefined,
      columnName: m[3],
      paramName: m[1],
    });
  }

  const seen = new Set<string>();
  return bindings.filter((b) => {
    const key = `${b.columnName}:${b.paramName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suffixToken(name: string): string {
  const parts = name.toLowerCase().split('_');
  return parts[parts.length - 1] || name.toLowerCase();
}

function assertSuffixAlignment(paramName: string, columnName: string): void {
  const pSuffix = suffixToken(paramName);
  const cSuffix = suffixToken(columnName);
  if (pSuffix === cSuffix) return;

  if (NAME_LIKE_SUFFIXES.has(pSuffix) && ID_LIKE_SUFFIXES.has(cSuffix)) {
    throw new BadRequestException({
      code: 'NL2SQL_PARAM_COLUMN_MISMATCH',
      message: `参数 :${paramName} 表示名称类取值，不得绑定 ID 列「${columnName}」；请改用名称列（如 *_name）并通过 JOIN 关联`,
    });
  }
  if (ID_LIKE_SUFFIXES.has(pSuffix) && NAME_LIKE_SUFFIXES.has(cSuffix)) {
    throw new BadRequestException({
      code: 'NL2SQL_PARAM_COLUMN_MISMATCH',
      message: `参数 :${paramName} 表示 ID 类取值，不得绑定名称列「${columnName}」`,
    });
  }
}

type ColumnTypeIndex = Map<string, string>;

function buildColumnTypeIndex(er: ErDiagram): ColumnTypeIndex {
  const index: ColumnTypeIndex = new Map();
  for (const table of er.tables ?? []) {
    for (const col of table.columns ?? []) {
      index.set(`${table.name.toLowerCase()}.${col.name.toLowerCase()}`, col.type);
      index.set(col.name.toLowerCase(), col.type);
    }
  }
  return index;
}

function buildAliasToTableMap(
  sql: string,
  referencedTables: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const tableName of referencedTables) {
    map.set(tableName.toLowerCase(), tableName);
    for (const alias of extractTableAliases(sql, tableName)) {
      map.set(alias.toLowerCase(), tableName);
    }
  }
  return map;
}

function resolveColumnType(
  index: ColumnTypeIndex,
  binding: ParamColumnBinding,
  aliasToTable: Map<string, string>,
): string | undefined {
  const colLower = binding.columnName.toLowerCase();

  if (binding.tableAlias) {
    const tableName = aliasToTable.get(binding.tableAlias.toLowerCase());
    if (tableName) {
      return index.get(`${tableName.toLowerCase()}.${colLower}`);
    }
  }

  for (const tableName of aliasToTable.values()) {
    const t = index.get(`${tableName.toLowerCase()}.${colLower}`);
    if (t) return t;
  }

  return index.get(colLower);
}

function isNumericColumnType(type: string): boolean {
  const lower = type.toLowerCase();
  return /\b(int|bigint|smallint|tinyint|mediumint|decimal|numeric|float|double|bit)\b/.test(
    lower,
  );
}

function looksLikeNonNumericString(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return false;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
  ) {
    return false;
  }
  return /[^\d.]/.test(t);
}

function columnInWhere(
  fullSql: string,
  afterWhereSql: string,
  tableName: string,
  column: string,
  referencedTables: string[],
): boolean {
  const col = escapeRegex(column);
  const table = escapeRegex(tableName);

  const qualified = [
    new RegExp(`\\b${table}\\s*\\.\\s*${col}\\b`, 'i'),
    new RegExp(`\`${table}\`\\s*\\.\\s*\`${col}\``, 'i'),
  ];
  if (qualified.some((re) => re.test(afterWhereSql))) {
    return true;
  }

  for (const alias of extractTableAliases(fullSql, tableName)) {
    const al = escapeRegex(alias);
    const aliasPatterns = [
      new RegExp(`\\b${al}\\s*\\.\\s*${col}\\b`, 'i'),
      new RegExp(`\`${al}\`\\s*\\.\\s*\`${col}\``, 'i'),
    ];
    if (aliasPatterns.some((re) => re.test(afterWhereSql))) {
      return true;
    }
  }

  const distinctTables = new Set(referencedTables.map((t) => t.toLowerCase()));
  if (distinctTables.size === 1 && distinctTables.has(tableName.toLowerCase())) {
    return new RegExp(`\\b${col}\\b`, 'i').test(afterWhereSql);
  }
  return false;
}

function extractTableAliases(sql: string, tableName: string): string[] {
  const aliases = new Set<string>();
  const escapedTable = escapeRegex(tableName);
  const re = new RegExp(
    `(?:\\bfrom|\\bjoin)\\s+(?:\`${escapedTable}\`|${escapedTable})(?:\\s+as)?\\s+(\`[a-zA-Z_][a-zA-Z0-9_]*\`|[a-zA-Z_][a-zA-Z0-9_]*)`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const alias = m[1].replace(/`/g, '');
    if (alias.toLowerCase() !== tableName.toLowerCase()) {
      aliases.add(alias);
    }
  }
  return [...aliases];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
