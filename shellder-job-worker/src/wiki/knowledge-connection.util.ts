import type { PrismaService } from '../prisma/prisma.service';

const KEY_BASE = 'knowledge.wikiBaseUrl';
const KEY_BASE_LEGACY = 'knowledge.pathyBaseUrl';
const KEY_TIMEOUT = 'knowledge.wikiTimeoutMs';
const KEY_TIMEOUT_LEGACY = 'knowledge.pathyTimeoutMs';
const DEFAULT_TIMEOUT_MS = 30_000;

export async function resolveWikiBaseUrl(prisma: PrismaService): Promise<string> {
  const db = (await readConfig(prisma, KEY_BASE, KEY_BASE_LEGACY))?.trim();
  if (db) return db.replace(/\/+$/, '');
  throw new Error(
    '未配置 wiki 知识库服务地址，请在管理后台「知识库管理」中保存 wiki 服务连接',
  );
}

export async function resolveWikiTimeoutMs(prisma: PrismaService): Promise<number> {
  const raw = (await readConfig(prisma, KEY_TIMEOUT, KEY_TIMEOUT_LEGACY))?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : DEFAULT_TIMEOUT_MS;
}

async function readConfig(
  prisma: PrismaService,
  key: string,
  legacyKey: string,
): Promise<string | undefined> {
  const row = await prisma.systemConfig.findUnique({ where: { configKey: key } });
  if (row?.configValue?.trim()) return row.configValue;
  const legacy = await prisma.systemConfig.findUnique({ where: { configKey: legacyKey } });
  return legacy?.configValue;
}
