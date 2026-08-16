import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MemberStats } from './types.js';

export class MemberStore {
  private filePath: string;
  private data: Record<string, MemberStats> = {};
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(filePath?: string) {
    this.filePath = resolve(process.cwd(), filePath || process.env.DATA_PATH || './data/stats.json');
    this.load();
  }

  private key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const content = readFileSync(this.filePath, 'utf-8');
    this.data = JSON.parse(content);
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      return;
    }
    this.saveTimeout = setTimeout(() => {
      this.saveSync();
      this.saveTimeout = null;
    }, 1000);
  }

  public saveSync(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  public increment(guildId: string, userId: string): number {
    const id = this.key(guildId, userId);
    const existing = this.data[id] || { messageCount: 0, lastActiveTimestamp: 0 };
    existing.messageCount += 1;
    existing.lastActiveTimestamp = Date.now();
    this.data[id] = existing;
    this.scheduleSave();
    return existing.messageCount;
  }

  public getStats(guildId: string, userId: string): MemberStats {
    const id = this.key(guildId, userId);
    return this.data[id] || { messageCount: 0, lastActiveTimestamp: 0 };
  }

  public getAllForGuild(guildId: string): Map<string, MemberStats> {
    const results = new Map<string, MemberStats>();
    const prefix = `${guildId}:`;
    for (const [key, stats] of Object.entries(this.data)) {
      if (key.startsWith(prefix)) {
        const userId = key.slice(prefix.length);
        results.set(userId, stats);
      }
    }
    return results;
  }
}
