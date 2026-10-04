import test from 'node:test';
import assert from 'node:assert/strict';
import { AnyThreadChannel, ChannelType, MessageFlags } from 'discord.js';
import { getLinkedIssues } from '../../src/issues/database.js';
import { tagsChanged } from '../../src/issues/handler.js';
import { createSync, createThreadFixture, stubGitHub } from './fixtures.js';

test('Forum issue sync', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('ignores threads outside tracked forums', async () => {
    const requests = stubGitHub();
    const { syncForumPost } = createSync();
    const { thread } = createThreadFixture({ appliedTags: ['tag-ln'], parentId: 'other-forum' });

    assert.deepEqual(await syncForumPost(thread), { status: 'untracked' });
    assert.equal(requests.length, 0);
  });

  await t.test('ignores configured channels that are not forums', async () => {
    const requests = stubGitHub();
    const { syncForumPost } = createSync();
    const { thread } = createThreadFixture({ appliedTags: ['tag-ln'], parentType: ChannelType.GuildText });

    assert.deepEqual(await syncForumPost(thread), { status: 'untracked' });
    assert.equal(requests.length, 0);
  });

  await t.test('waits for a mod tag', async () => {
    const requests = stubGitHub();
    const { syncForumPost } = createSync();
    const { thread } = createThreadFixture({ appliedTags: ['tag-feature'] });

    assert.deepEqual(await syncForumPost(thread), { status: 'untagged' });
    assert.equal(requests.length, 0);
  });

  await t.test('creates one issue per mod tag and announces them once', async () => {
    const requests = stubGitHub();
    const { db, syncForumPost } = createSync();
    const { thread, sent } = createThreadFixture({ appliedTags: ['tag-om', 'tag-feature', 'tag-ln'] });

    const result = await syncForumPost(thread);

    assert.equal(result.status, 'synced');
    assert.deepEqual(requests.map(request => request.url), [
      'https://api.github.com/repos/AlmanaX-21/LogisticsNetworks/issues',
      'https://api.github.com/repos/AlmanaX-21/OtherMod/issues'
    ]);
    assert.equal(requests[0].body.title, 'Option to switch straight line connection hints');
    assert.deepEqual(requests[0].body.labels, ['enhancement']);
    assert.equal(getLinkedIssues(db, 'thread-1').length, 2);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].content, [
      '📌 Tracked on GitHub: [AlmanaX-21/LogisticsNetworks#1](https://github.com/AlmanaX-21/LogisticsNetworks/issues/1)',
      '📌 Tracked on GitHub: [AlmanaX-21/OtherMod#2](https://github.com/AlmanaX-21/OtherMod/issues/2)'
    ].join('\n'));
    assert.equal(sent[0].flags, MessageFlags.SuppressEmbeds);
    assert.deepEqual(sent[0].allowedMentions, { parse: [] });
  });

  await t.test('skips repos that are already linked', async () => {
    const requests = stubGitHub();
    const { syncForumPost } = createSync();
    const { thread, sent } = createThreadFixture({ appliedTags: ['tag-ln'] });

    await syncForumPost(thread);
    const second = await syncForumPost(thread);

    assert.equal(requests.length, 1);
    assert.equal(sent.length, 1);
    assert.deepEqual(second, {
      status: 'synced',
      created: [],
      existing: [{
        repo: 'AlmanaX-21/LogisticsNetworks',
        issue_number: 1,
        issue_url: 'https://github.com/AlmanaX-21/LogisticsNetworks/issues/1'
      }],
      errors: []
    });
  });

  await t.test('keeps successes on partial failure and retries only the missing repo', async () => {
    stubGitHub(['OtherMod']);
    const { db, syncForumPost } = createSync();
    const { thread } = createThreadFixture({ appliedTags: ['tag-ln', 'tag-om'] });

    const first = await syncForumPost(thread);
    assert.ok(first.status === 'synced');
    assert.equal(first.created.length, 1);
    assert.match(first.errors[0], /GitHub 404 for AlmanaX-21\/OtherMod/);

    const requests = stubGitHub();
    await syncForumPost(thread);

    assert.deepEqual(requests.map(request => request.url), [
      'https://api.github.com/repos/AlmanaX-21/OtherMod/issues'
    ]);
    assert.equal(getLinkedIssues(db, 'thread-1').length, 2);
  });

  await t.test('keeps created issues when the thread reply fails', async () => {
    stubGitHub();
    const { db, syncForumPost } = createSync();
    const { thread } = createThreadFixture({ appliedTags: ['tag-ln'], sendFails: true });

    const result = await syncForumPost(thread);

    assert.ok(result.status === 'synced');
    assert.equal(result.created.length, 1);
    assert.equal(getLinkedIssues(db, 'thread-1').length, 1);
  });
});

test('tagsChanged ignores order and detects additions and swaps', () => {
  const thread = (appliedTags: string[]) => ({ appliedTags }) as unknown as AnyThreadChannel;

  assert.equal(tagsChanged(thread(['a', 'b']), thread(['b', 'a'])), false);
  assert.equal(tagsChanged(thread(['a']), thread(['a', 'b'])), true);
  assert.equal(tagsChanged(thread(['a', 'b']), thread(['a', 'c'])), true);
});
