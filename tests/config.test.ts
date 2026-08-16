import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, addOrUpdateRoleRule, removeRoleRule } from '../src/config.js';
import { BotConfig, RoleRule } from '../src/types.js';

test('addOrUpdateRoleRule adds new rules and updates existing rules', () => {
  const testConfigPath = resolve(process.cwd(), './data/test-config.json');
  const initialConfig: BotConfig = {
    checkIntervalMinutes: 30,
    roles: [
      { name: 'Starter', roleId: '111', messageCount: 50, timeInServerDays: null }
    ]
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
    roles: [
      { name: 'Chatter', roleId: '101', messageCount: 100, timeInServerDays: null },
      { name: 'Elder', roleId: '102', messageCount: null, timeInServerDays: 60 }
    ]
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
