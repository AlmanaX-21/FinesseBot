import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BotConfig } from './types.js';

export function loadConfig(customPath?: string): BotConfig {
  const targetPath = customPath || process.env.CONFIG_PATH || './config.json';
  const resolvedPath = resolve(process.cwd(), targetPath);

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
