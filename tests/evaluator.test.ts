import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDaysInServer, isRoleEligible, evaluateMember } from '../src/evaluator.js';
import { RoleRule } from '../src/types.js';

test('calculateDaysInServer correctly calculates elapsed days', () => {
  const now = 1_700_000_000_000;
  const thirtyDaysMs = 30 * 86_400_000;
  const joined = now - thirtyDaysMs;

  assert.equal(calculateDaysInServer(joined, now), 30);
  assert.equal(calculateDaysInServer(now + 10000, now), 0);
  assert.equal(calculateDaysInServer(0, now), 0);
});

test('isRoleEligible handles message count only condition', () => {
  const rule: RoleRule = {
    name: 'Active Chatter',
    messageCount: 100,
    timeInServerDays: null
  };

  assert.equal(isRoleEligible(99, 10, rule), false);
  assert.equal(isRoleEligible(100, 10, rule), true);
  assert.equal(isRoleEligible(250, 0, rule), true);
});

test('isRoleEligible handles time in server only condition', () => {
  const rule: RoleRule = {
    name: 'Veteran',
    messageCount: null,
    timeInServerDays: 30
  };

  assert.equal(isRoleEligible(0, 29, rule), false);
  assert.equal(isRoleEligible(0, 30, rule), true);
  assert.equal(isRoleEligible(500, 45, rule), true);
});

test('isRoleEligible handles combined conditions', () => {
  const rule: RoleRule = {
    name: 'Dedicated Member',
    messageCount: 500,
    timeInServerDays: 180
  };

  assert.equal(isRoleEligible(499, 200, rule), false);
  assert.equal(isRoleEligible(500, 179, rule), false);
  assert.equal(isRoleEligible(500, 180, rule), true);
  assert.equal(isRoleEligible(1000, 365, rule), true);
});

test('evaluateMember returns eligible and next roles with accurate progress', () => {
  const rules: RoleRule[] = [
    { name: 'Chatter', messageCount: 50, timeInServerDays: null },
    { name: 'Regular', messageCount: null, timeInServerDays: 10 },
    { name: 'Elite', messageCount: 200, timeInServerDays: 30 }
  ];

  const now = Date.now();
  const joined = now - 15 * 86_400_000;
  const result = evaluateMember('user123', 'guild123', 60, joined, rules);

  assert.equal(result.eligibleRoles.length, 2);
  assert.equal(result.eligibleRoles[0].name, 'Chatter');
  assert.equal(result.eligibleRoles[1].name, 'Regular');

  assert.equal(result.nextRoles.length, 1);
  assert.equal(result.nextRoles[0].rule.name, 'Elite');
  assert.equal(result.nextRoles[0].missingMessages, 140);
  assert.equal(result.nextRoles[0].missingDays, 15);
});
