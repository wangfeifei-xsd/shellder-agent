import { BadRequestException } from '@nestjs/common';
import { ErDiagram } from '../connector/connector-schema.types';

export interface Nl2SqlParsedOutput {
  sql: string;
  referencedTables: string[];
  params: Record<string, unknown>;
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

/** NL2SQL 生成后的语义校验（范围列、占位参数、参数-列一致性、用户实体名提取） */
export function assertNl2SqlSemantics(input: Nl2SqlSemanticValidationInput): void {
  assertNoScopeColumnInSql(input.parsed, input.er, input.scopeContext);
  assertParamsNotPlaceholder(input.parsed);
  assertParamColumnConsistency(input.parsed, input.er);
  assertParamsReflectUserLiterals(input.parsed, input.userMessage);
}

function isActiveScopeContext(scopeContext?: string): boolean {
  const text = scopeContext?.trim();
  return !!text && !text.includes('未配置业务数据范围');
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

/** ④ 用户问题中的实体名/引号内文字须出现在 params 中 */
function assertParamsReflectUserLiterals(
  parsed: Nl2SqlParsedOutput,
  userMessage: string,
): void {
  const literals = extractUserLiterals(userMessage);
  if (literals.length === 0) return;

  const paramValues = Object.values(parsed.params ?? {})
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim());

  if (paramValues.length === 0) {
    throw new BadRequestException({
      code: 'NL2SQL_PARAM_LITERAL_MISSING',
      message: `用户问题含实体名「${literals.join('、')}」，但 params 未提供对应字符串取值`,
    });
  }

  for (const lit of literals) {
    const found = paramValues.some((v) => v.includes(lit) || lit.includes(v));
    if (!found) {
      throw new BadRequestException({
        code: 'NL2SQL_PARAM_LITERAL_MISSING',
        message: `用户问题中的「${lit}」未出现在 params 中，请从用户问题提取真实值写入 params`,
      });
    }
  }
}

// ── helpers ─────────────────────────────────────────────

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

function extractUserLiterals(userMessage: string): string[] {
  const literals = new Set<string>();
  const msg = userMessage.trim();

  for (const m of msg.matchAll(/[「『"']([^」』"']+)[」』"']/g)) {
    const v = m[1]?.trim();
    if (v && v.length >= 2) literals.add(v);
  }

  for (const m of msg.matchAll(/名为\s*['「"']([^」』"']+)['」"']/g)) {
    const v = m[1]?.trim();
    if (v && v.length >= 2) literals.add(v);
  }

  const unquoted = msg.match(/^(.+?)(?:有哪些|有多少|有几个|几位|几个|下的|中(?:的)?(?:员工|用户|订单|记录))/);
  if (unquoted?.[1]) {
    const candidate = unquoted[1]
      .replace(/^(查询|查|统计|列出|显示|获取)\s*/u, '')
      .trim();
    if (
      candidate.length >= 2 &&
      candidate.length <= 50 &&
      !/^(所有|全部|每个|哪些)/u.test(candidate)
    ) {
      literals.add(candidate);
    }
  }

  return [...literals];
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
