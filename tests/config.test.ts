import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig, addOrUpdateRoleRule, removeRoleRule } from '../src/config.js';
import { BotConfig, RoleRule } from '../src/types.js';

test('addOrUpdateRoleRule adds new rules and updates existing rules', () => {
  const testConfigPath = resolve(process.cwd(), './data/test-config.json');
  const initialConfig: BotConfig = {
    checkIntervalMinutes: 30,
    tagPrefix: '!',
    roles: [
      { name: 'Starter', roleId: '111', messageCount: 50, timeInServerDays: null }
    ],
    issueForums: []
  };

  writeFileSync(testConfigPath, JSON.stringify(initialConfig, null, 2), 'utf-8');

  const newRule: RoleRule = {
    name: 'Veteran',
    roleId: '222',
    messageCount: null,
    timeInServerDays: 30
  };

  const updated = addOrUpdateRoleRule(newRule, testConfigPath);
  assert.equal(updated.roles.length, 2);
  assert.equal(updated.roles[1].name, 'Veteran');

  const modifiedStarter: RoleRule = {
    name: 'Starter',
    roleId: '111',
    messageCount: 100,
    timeInServerDays: null
  };

  const updatedAgain = addOrUpdateRoleRule(modifiedStarter, testConfigPath);
  assert.equal(updatedAgain.roles.length, 2);
  assert.equal(updatedAgain.roles[0].messageCount, 100);

  const reloaded = loadConfig(testConfigPath);
  assert.equal(reloaded.roles[0].messageCount, 100);

  if (existsSync(testConfigPath)) {
    rmSync(testConfigPath);
  }
});

test('removeRoleRule removes rule by roleId or name', () => {
  const testConfigPath = resolve(process.cwd(), './data/test-config-remove.json');
  const initialConfig: BotConfig = {
    checkIntervalMinutes: 60,
    tagPrefix: '!',
    roles: [
      { name: 'Chatter', roleId: '101', messageCount: 100, timeInServerDays: null },
      { name: 'Elder', roleId: '102', messageCount: null, timeInServerDays: 60 }
    ],
    issueForums: []
  };

  writeFileSync(testConfigPath, JSON.stringify(initialConfig, null, 2), 'utf-8');

  const { updatedConfig, removedRule } = removeRoleRule('101', testConfigPath);
  assert.equal(updatedConfig.roles.length, 1);
  assert.equal(removedRule?.name, 'Chatter');

  const { updatedConfig: byName, removedRule: removedByName } = removeRoleRule('elder', testConfigPath);
  assert.equal(byName.roles.length, 0);
  assert.equal(removedByName?.name, 'Elder');

  if (existsSync(testConfigPath)) {
    rmSync(testConfigPath);
  }
});

test('loadConfig safely handles empty or partial config files', () => {
  const testConfigPath = resolve(process.cwd(), './data/test-config-empty.json');
  writeFileSync(testConfigPath, '{}', 'utf-8');

  const loaded = loadConfig(testConfigPath);
  assert.equal(Array.isArray(loaded.roles), true);
  assert.equal(loaded.roles.length, 0);
  assert.equal(loaded.checkIntervalMinutes, 5);

  const rule: RoleRule = {
    name: 'Newbie',
    roleId: '999',
    messageCount: 10,
    timeInServerDays: null
  };

  const updated = addOrUpdateRoleRule(rule, testConfigPath);
  assert.equal(updated.roles.length, 1);
  assert.equal(updated.roles[0].name, 'Newbie');

  if (existsSync(testConfigPath)) {
    rmSync(testConfigPath);
  }
});

test('loadConfig defaults missing or invalid tag prefixes', () => {
  const testConfigPath = resolve(process.cwd(), './data/test-config-prefix-default.json');

  writeFileSync(testConfigPath, JSON.stringify({ tagPrefix: 'bad prefix' }), 'utf-8');
  assert.equal(loadConfig(testConfigPath).tagPrefix, '!');

  writeFileSync(testConfigPath, '{}', 'utf-8');
  assert.equal(loadConfig(testConfigPath).tagPrefix, '!');

  if (existsSync(testConfigPath)) {
    rmSync(testConfigPath);
  }
});

test('loadConfig preserves a configured tag prefix', () => {
  const testConfigPath = resolve(process.cwd(), './data/test-config-prefix-custom.json');

  writeFileSync(testConfigPath, JSON.stringify({ tagPrefix: '??' }), 'utf-8');
  assert.equal(loadConfig(testConfigPath).tagPrefix, '??');

  if (existsSync(testConfigPath)) {
    rmSync(testConfigPath);
  }
});

const tempDirs: string[] = [];
after(() => tempDirs.forEach(dir => rmSync(dir, { recursive: true, force: true })));

function writeTempConfig(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'finesse-config-'));
  tempDirs.push(dir);
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify(content), 'utf-8');
  return path;
}

test('loadConfig parses issue forums and drops invalid entries', () => {
  const path = writeTempConfig({
    issueForums: [
      {
        channelId: 'forum-1',
        repos: {
          LogisticsNetworks: 'AlmanaX-21/LogisticsNetworks',
          Broken: 'not-a-repo',
          Traversal: '../..',
          Numeric: 5
        },
        labels: { bugs: 'bug', feature: 'enhancement' }
      },
      { repos: { Other: 'AlmanaX-21/Other' } },
      'garbage'
    ]
  });

  assert.deepEqual(loadConfig(path).issueForums, [
    {
      channelId: 'forum-1',
      repos: { LogisticsNetworks: 'AlmanaX-21/LogisticsNetworks' },
      labels: { bugs: 'bug', feature: 'enhancement' }
    }
  ]);
});

test('loadConfig defaults issue forums to an empty list', () => {
  assert.deepEqual(loadConfig(writeTempConfig({})).issueForums, []);
  assert.deepEqual(loadConfig(join(tmpdir(), 'finesse-missing-config.json')).issueForums, []);
});

test('saving role rules keeps issue forums', () => {
  const issueForums = [
    { channelId: 'forum-1', repos: { Mod: 'AlmanaX-21/Mod' }, labels: {} }
  ];
  const path = writeTempConfig({ roles: [], issueForums });

  addOrUpdateRoleRule({ name: 'Starter', roleId: '1', messageCount: 5, timeInServerDays: null }, path);

  assert.deepEqual(loadConfig(path).issueForums, issueForums);
});
