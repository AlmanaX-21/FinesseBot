import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BotConfig, RoleRule } from './types.js';

export function getConfigPath(customPath?: string): string {
  const targetPath = customPath || process.env.CONFIG_PATH || './config.json';
  return resolve(process.cwd(), targetPath);
}

export function loadConfig(customPath?: string): BotConfig {
  const resolvedPath = getConfigPath(customPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found at ${resolvedPath}`);
  }

  const raw = readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(raw) as BotConfig;

  if (!Array.isArray(parsed.roles)) {
    throw new Error('Config missing "roles" array');
  }

  return {
    checkIntervalMinutes: parsed.checkIntervalMinutes || 60,
    roles: parsed.roles
  };
}

export function saveConfig(config: BotConfig, customPath?: string): void {
  const resolvedPath = getConfigPath(customPath);
  writeFileSync(resolvedPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function addOrUpdateRoleRule(rule: RoleRule, customPath?: string): BotConfig {
  const current = loadConfig(customPath);
  const existingIndex = current.roles.findIndex(r =>
    (rule.roleId && r.roleId === rule.roleId) ||
    r.name.toLowerCase().trim() === rule.name.toLowerCase().trim()
  );

  if (existingIndex >= 0) {
    current.roles[existingIndex] = { ...current.roles[existingIndex], ...rule };
  } else {
    current.roles.push(rule);
  }

  saveConfig(current, customPath);
  return current;
}

export function removeRoleRule(
  roleIdentifier: string,
  customPath?: string
): { updatedConfig: BotConfig; removedRule: RoleRule | null } {
  const current = loadConfig(customPath);
  const normalized = roleIdentifier.toLowerCase().trim();

  const targetIndex = current.roles.findIndex(r =>
    (r.roleId && r.roleId === roleIdentifier) ||
    r.name.toLowerCase().trim() === normalized
  );

  if (targetIndex === -1) {
    return { updatedConfig: current, removedRule: null };
  }

  const [removedRule] = current.roles.splice(targetIndex, 1);
  saveConfig(current, customPath);
  return { updatedConfig: current, removedRule };
}
