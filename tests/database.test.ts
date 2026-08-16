import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemberStore } from '../src/database.js';

test('MemberStore tracks and retrieves member message counts', () => {
  const testDbPath = resolve(process.cwd(), './data/test-stats.json');
  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
  }

  const store = new MemberStore('./data/test-stats.json');

  const count1 = store.increment('guildA', 'user1');
  const count2 = store.increment('guildA', 'user1');
  const count3 = store.increment('guildA', 'user2');

  assert.equal(count1, 1);
  assert.equal(count2, 2);
  assert.equal(count3, 1);

  const stats = store.getStats('guildA', 'user1');
  assert.equal(stats.messageCount, 2);
  assert.ok(stats.lastActiveTimestamp > 0);

  const emptyStats = store.getStats('guildA', 'nonexistent');
  assert.equal(emptyStats.messageCount, 0);

  store.saveSync();
  assert.ok(existsSync(testDbPath));

  // Reload store
  const reloaded = new MemberStore('./data/test-stats.json');
  assert.equal(reloaded.getStats('guildA', 'user1').messageCount, 2);

  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
  }
});
