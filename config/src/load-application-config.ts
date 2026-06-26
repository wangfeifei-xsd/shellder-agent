import { config as loadDotenv } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { AppProfile } from './enums';
import type { ApplicationConfig } from './application-config.types';
import { bindApplicationConfig } from './bind-application-config';

const PLACEHOLDER = /\$\{([^}:]+)(?::([^}]*))?\}/g;

const CONFIG_MARKERS = [
  'config/application.yml.dockeruse',
  'config/application.yml',
  'application.yml.dockeruse',
  'application.yml',
] as const;

export function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

function hasConfigMarker(root: string): boolean {
  return CONFIG_MARKERS.some((marker) => existsSync(resolve(root, marker)));
}

function findConfigRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(__dirname, '../..'),
    resolve(__dirname, '..'),
  ];
  for (const root of candidates) {
    if (hasConfigMarker(root)) return root;
  }
  return resolve(__dirname, '..');
}

function resolveConfigFile(root: string, name: string): string {
  const nested = resolve(root, 'config', name);
  if (existsSync(nested)) return nested;
  return resolve(root, name);
}

function useDockerConfigFiles(root: string): boolean {
  if (process.env.SHELLDER_CONFIG_SOURCE === 'docker') return true;
  const dockerBase = resolveConfigFile(root, 'application.yml.dockeruse');
  const localBase = resolveConfigFile(root, 'application.yml');
  return (
    process.env.NODE_ENV === 'production' &&
    existsSync(dockerBase) &&
    !existsSync(localBase)
  );
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
  const docker = useDockerConfigFiles(root);

  const envFile = docker ? '.env.dockeruse' : '.env';
  const envPath = resolveConfigFile(root, envFile);
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: true });
  }

  const baseYaml = docker ? 'application.yml.dockeruse' : 'application.yml';
  let merged = loadYamlFile(resolveConfigFile(root, baseYaml));

  const profile =
    process.env.SHELLDER_PROFILE ??
    (typeof merged.profile === 'string' ? merged.profile : AppProfile.DEFAULT);
  if (profile && profile !== AppProfile.DEFAULT) {
    const profileYaml = docker
      ? `application-${profile}.yml.dockeruse`
      : `application-${profile}.yml`;
    merged = deepMerge(merged, loadYamlFile(resolveConfigFile(root, profileYaml)));
  }

  const resolved = resolvePlaceholders(merged) as Record<string, unknown>;
  cached = bindApplicationConfig(resolved, String(profile));
  return cached;
}

export function resetApplicationConfigCache(): void {
  cached = null;
}
