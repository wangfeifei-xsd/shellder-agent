import { config as loadDotenv } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { AppProfile } from './enums';
import type { ApplicationConfig } from './application-config.types';
import { bindApplicationConfig } from './bind-application-config';

const PLACEHOLDER = /\$\{([^}:]+)(?::([^}]*))?\}/g;

export function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

function findConfigRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(__dirname, '../..'),
    resolve(__dirname, '..'),
  ];
  for (const root of candidates) {
    if (existsSync(resolve(root, 'config/application.yml.example'))) {
      return root;
    }
  }
  return resolve(__dirname, '..');
}

function configPath(root: string, name: string): string {
  return resolve(root, 'config', name);
}

function loadYamlFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw);
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function resolvePlaceholders(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (_, name: string, fallback?: string) => {
      const fromEnv = process.env[name];
      if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
      return fallback ?? '';
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolvePlaceholders(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolvePlaceholders(v);
    }
    return out;
  }
  return value;
}

let cached: ApplicationConfig | null = null;

export function loadApplicationConfig(force = false): ApplicationConfig {
  if (cached && !force) return cached;

  const root = findConfigRoot();
  const envPath = configPath(root, '.env');
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: true });
  }

  let merged = loadYamlFile(configPath(root, 'application.yml.example'));
  merged = deepMerge(merged, loadYamlFile(configPath(root, 'application.yml')));

  const profile =
    process.env.SHELLDER_PROFILE ??
    (typeof merged.profile === 'string' ? merged.profile : AppProfile.DEFAULT);
  if (profile && profile !== AppProfile.DEFAULT) {
    merged = deepMerge(
      merged,
      loadYamlFile(configPath(root, `application-${profile}.yml`)),
    );
  }

  const resolved = resolvePlaceholders(merged) as Record<string, unknown>;
  cached = bindApplicationConfig(resolved, String(profile));
  return cached;
}

export function resetApplicationConfigCache(): void {
  cached = null;
}
