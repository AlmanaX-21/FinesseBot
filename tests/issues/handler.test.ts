import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { AnyThreadChannel, ChannelType, MessageFlags } from 'discord.js';
import { getLinkedIssues, initIssueDb } from '../../src/issues/database.js';
import { createIssueSync, tagsChanged } from '../../src/issues/handler.js';
import { IssueForum } from '../../src/types.js';

const forum: IssueForum = {
  channelId: 'forum-1',
  repos: {
    LogisticsNetworks: 'AlmanaX-21/LogisticsNetworks',
    OtherMod: 'AlmanaX-21/OtherMod'
  },
  labels: { feature: 'enhancement' }
};

const availableTags = [
  { id: 'tag-ln', name: 'LogisticsNetworks' },
  { id: 'tag-om', name: 'OtherMod' },
  { id: 'tag-feature', name: 'feature' }
];

const starterMessage = {
  cleanContent: 'Straight lines please',
  member: { displayName: 'Blueye' },
  author: { displayName: 'blueye' },
  attachments: []
};

interface SentPayload {
  content: string;
  flags?: number;
}

interface ThreadFixtureOptions {
  appliedTags: string[];
  parentId?: string;
  fetchStarterMessage?: () => Promise<unknown>;
}

function createThreadFixture(options: ThreadFixtureOptions) {
  const sent: SentPayload[] = [];
  const thread = {
    id: 'thread-1',
    name: 'Option to switch straight line connection hints',
    url: 'https://discord.com/channels/guild-1/thread-1',
    parentId: options.parentId ?? 'forum-1',
    parent: { type: ChannelType.GuildForum, availableTags },
    appliedTags: options.appliedTags,
    fetchStarterMessage: options.fetchStarterMessage ?? (async () => starterMessage),
    send: async (payload: SentPayload) => {
      sent.push(payload);
    }
  } as unknown as AnyThreadChannel;
  return { thread, sent };
}

function stubGitHub(failingRepos: string[] = []) {
  const requests: Array<{ url: string; body: { title: string; labels: string[] } }> = [];
  let nextNumber = 1;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    requests.push({ url: target, body: JSON.parse(String(init?.body)) });
    if (failingRepos.some(repo => target.includes(repo))) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }
    const number = nextNumber++;
    const repo = target.replace('https://api.github.com/repos/', '').replace('/issues', '');
    return new Response(
      JSON.stringify({ number, html_url: `https://github.com/${repo}/issues/${number}` }),
      { status: 201 }
    );
  }) as typeof fetch;
  return requests;
}

function createSync() {
  const db = new Database(':memory:');
  initIssueDb(db);
  const syncForumPost = createIssueSync({ db, token: 'token-1', forums: [forum], retryDelayMs: 0 });
  return { db, syncForumPost };
}

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

test('tagsChanged ignores order and detects additions and swaps', () => {
  const thread = (appliedTags: string[]) => ({ appliedTags }) as unknown as AnyThreadChannel;

  assert.equal(tagsChanged(thread(['a', 'b']), thread(['b', 'a'])), false);
  assert.equal(tagsChanged(thread(['a']), thread(['a', 'b'])), true);
  assert.equal(tagsChanged(thread(['a', 'b']), thread(['a', 'c'])), true);
});
