import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { getLinkedIssues, initIssueDb, saveLinkedIssue } from '../../src/issues/database.js';

const logisticsIssue = {
  repo: 'AlmanaX-21/LogisticsNetworks',
  issue_number: 1,
  issue_url: 'https://github.com/AlmanaX-21/LogisticsNetworks/issues/1'
};

const otherIssue = {
  repo: 'AlmanaX-21/OtherMod',
  issue_number: 7,
  issue_url: 'https://github.com/AlmanaX-21/OtherMod/issues/7'
};

test('Forum issue database layer', async (t) => {
  const db = new Database(':memory:');
  initIssueDb(db);

  await t.test('returns nothing for an unlinked thread', () => {
    assert.deepEqual(getLinkedIssues(db, 'thread-1'), []);
  });

  await t.test('stores one link per repo for a thread', () => {
    saveLinkedIssue(db, 'thread-1', logisticsIssue);
    saveLinkedIssue(db, 'thread-1', otherIssue);
    saveLinkedIssue(db, 'thread-2', logisticsIssue);

    assert.deepEqual(getLinkedIssues(db, 'thread-1'), [logisticsIssue, otherIssue]);
    assert.deepEqual(getLinkedIssues(db, 'thread-2'), [logisticsIssue]);
  });

  await t.test('rejects a second link for the same thread and repo', () => {
    assert.throws(() => saveLinkedIssue(db, 'thread-1', logisticsIssue));
  });

  await t.test('initIssueDb is safe to run twice', () => {
    initIssueDb(db);
    assert.equal(getLinkedIssues(db, 'thread-1').length, 2);
  });
});
