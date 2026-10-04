import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BotConfig, IssueForum, RoleRule } from './types.js';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/u;

function stringEntries(
  value: unknown,
  isValid: (entry: string) => boolean = () => true
): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && isValid(entry[1])
    )
  );
}

function parseIssueForums(value: unknown): IssueForum[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(entry => typeof entry?.channelId === 'string' && entry.channelId.length > 0)
    .map(entry => ({
      channelId: entry.channelId,
      repos: stringEntries(entry.repos, repo => REPO_PATTERN.test(repo)),
      labels: stringEntries(entry.labels)
    }));
}

export function getConfigPath(customPath?: string): string {
  const targetPath = customPath || process.env.CONFIG_PATH || './config.json';
  return resolve(process.cwd(), targetPath);
}

export function loadConfig(customPath?: string): BotConfig {
  const resolvedPath = getConfigPath(customPath);

  if (!existsSync(resolvedPath)) {
    return {
      checkIntervalMinutes: 5,
      tagPrefix: '!',
      roles: [],
      issueForums: []
    };
  }

  let parsed: Partial<BotConfig> = {};
  try {
    const raw = readFileSync(resolvedPath, 'utf-8');
    parsed = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }

  return {
    checkIntervalMinutes: typeof parsed.checkIntervalMinutes === 'number' ? parsed.checkIntervalMinutes : 5,
    tagPrefix: typeof parsed.tagPrefix === 'string' && /^\S{1,5}$/u.test(parsed.tagPrefix)
      ? parsed.tagPrefix
      : '!',
    roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    issueForums: parseIssueForums(parsed.issueForums)
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
