import test from 'node:test';
import assert from 'node:assert/strict';
import { getLinkedIssues } from '../../src/issues/database.js';
import { createSync, createThreadFixture, starterMessage, stubGitHub } from './fixtures.js';

test('Forum issue sync races', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('reports busy while the same post is syncing', async () => {
    stubGitHub();
    const { syncForumPost } = createSync();
    let releaseStarter: () => void = () => undefined;
    const starterReady = new Promise<void>(resolve => {
      releaseStarter = resolve;
    });
    const { thread } = createThreadFixture({
      appliedTags: ['tag-ln'],
      fetchStarterMessage: async () => {
        await starterReady;
        return starterMessage;
      }
    });

    const first = syncForumPost(thread);
    assert.deepEqual(await syncForumPost(thread), { status: 'busy' });

    releaseStarter();
    assert.equal((await first).status, 'synced');
  });

  await t.test('syncs a mod tag added while another repo is in flight', async () => {
    stubGitHub();
    const { db, syncForumPost } = createSync();
    let releaseStarter: () => void = () => undefined;
    const starterReady = new Promise<void>(resolve => {
      releaseStarter = resolve;
    });
    let gated = true;
    const { thread } = createThreadFixture({
      appliedTags: ['tag-ln'],
      fetchStarterMessage: async () => {
        if (gated) {
          gated = false;
          await starterReady;
        }
        return starterMessage;
      }
    });

    const first = syncForumPost(thread);
    thread.appliedTags.push('tag-om');
    const second = await syncForumPost(thread);
    releaseStarter();
    await first;

    assert.equal(second.status, 'synced');
    assert.deepEqual(
      getLinkedIssues(db, 'thread-1').map(issue => issue.repo).sort(),
      ['AlmanaX-21/LogisticsNetworks', 'AlmanaX-21/OtherMod']
    );
  });

  await t.test('retries the starter message before creating the issue', async () => {
    const requests = stubGitHub();
    const { syncForumPost } = createSync();
    let attempts = 0;
    const { thread } = createThreadFixture({
      appliedTags: ['tag-ln'],
      fetchStarterMessage: async () => (++attempts < 3 ? null : starterMessage)
    });

    const result = await syncForumPost(thread);

    assert.equal(result.status, 'synced');
    assert.equal(attempts, 3);
    assert.equal(requests.length, 1);
  });

  await t.test('fails without leaving the post stuck when the starter never arrives', async () => {
    const requests = stubGitHub();
    const { syncForumPost } = createSync();
    const { thread } = createThreadFixture({
      appliedTags: ['tag-ln'],
      fetchStarterMessage: async () => null
    });

    await assert.rejects(syncForumPost(thread), /Starter message unavailable/);
    await assert.rejects(syncForumPost(thread), /Starter message unavailable/);
    assert.equal(requests.length, 0);
  });

  await t.test('keeps the Discord error as the cause when the starter fetch fails', async () => {
    stubGitHub();
    const { syncForumPost } = createSync();
    const unknownMessage = new Error('Unknown Message');
    const { thread } = createThreadFixture({
      appliedTags: ['tag-ln'],
      fetchStarterMessage: async () => {
        throw unknownMessage;
      }
    });

    await assert.rejects(syncForumPost(thread), (error: Error) => {
      assert.match(error.message, /Starter message unavailable/);
      assert.equal(error.cause, unknownMessage);
      return true;
    });
  });
});
