import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationComments, buildIssueDraft, issueLink, reposForTags } from '../../src/issues/format.js';
import { ForumPost, ThreadReply } from '../../src/issues/types.js';
import { IssueForum } from '../../src/types.js';

const forum: IssueForum = {
  channelId: 'forum-1',
  repos: {
    LogisticsNetworks: 'AlmanaX-21/LogisticsNetworks',
    OtherMod: 'AlmanaX-21/OtherMod'
  },
  labels: { bugs: 'bug', feature: 'enhancement' }
};

const post: ForumPost = {
  title: 'Option to switch straight line connection hints',
  url: 'https://discord.com/channels/guild-1/thread-1',
  author: 'Blueye',
  content: 'Lines get confusing, ping @Almana',
  attachments: [{ name: 'lines.png', url: 'https://cdn.discordapp.com/lines.png' }],
  tagNames: ['Feature', 'logisticsnetworks']
};

test('reposForTags matches mod tags case-insensitively', () => {
  assert.deepEqual(
    reposForTags(forum, ['logisticsnetworks', 'feature']),
    ['AlmanaX-21/LogisticsNetworks']
  );
});

test('reposForTags returns one repo per mod tag', () => {
  assert.deepEqual(
    reposForTags(forum, ['LogisticsNetworks', 'OtherMod']),
    ['AlmanaX-21/LogisticsNetworks', 'AlmanaX-21/OtherMod']
  );
});

test('reposForTags deduplicates tags that share a repo', () => {
  const shared: IssueForum = {
    ...forum,
    repos: { LN: 'AlmanaX-21/LogisticsNetworks', Logistics: 'AlmanaX-21/LogisticsNetworks' }
  };

  assert.deepEqual(reposForTags(shared, ['LN', 'Logistics']), ['AlmanaX-21/LogisticsNetworks']);
});

test('reposForTags returns nothing without a mod tag', () => {
  assert.deepEqual(reposForTags(forum, ['bugs']), []);
});

test('buildIssueDraft builds title, labels and body', () => {
  const draft = buildIssueDraft(forum, post);

  assert.equal(draft.title, 'Option to switch straight line connection hints');
  assert.deepEqual(draft.labels, ['enhancement']);
  assert.equal(draft.body, [
    'Lines get confusing, ping @\u200BAlmana',
    '### Attachments\n- [lines.png](https://cdn.discordapp.com/lines.png)',
    '---\nReported by **Blueye** on Discord: ' +
      '[Option to switch straight line connection hints](https://discord.com/channels/guild-1/thread-1)'
  ].join('\n\n'));
});

test('buildIssueDraft handles posts without text or attachments', () => {
  const draft = buildIssueDraft(forum, { ...post, content: '   ', attachments: [] });

  assert.ok(draft.body.startsWith('_No description provided._\n\n---\n'));
  assert.ok(!draft.body.includes('### Attachments'));
});

test('buildIssueDraft escapes brackets in link text', () => {
  const draft = buildIssueDraft(forum, { ...post, title: 'Crash [1.12.0]' });

  assert.ok(draft.body.includes('[Crash \\[1.12.0\\]](https://discord.com/channels/guild-1/thread-1)'));
  assert.equal(draft.title, 'Crash [1.12.0]');
});

test('buildIssueDraft escapes backslashes in link text', () => {
  const draft = buildIssueDraft(forum, { ...post, title: 'Crash\\' });

  assert.ok(draft.body.includes('[Crash\\\\](https://discord.com/channels/guild-1/thread-1)'));
});

test('issueLink formats a markdown link', () => {
  assert.equal(
    issueLink({
      repo: 'AlmanaX-21/LogisticsNetworks',
      issue_number: 42,
      issue_url: 'https://github.com/AlmanaX-21/LogisticsNetworks/issues/42'
    }),
    '[AlmanaX-21/LogisticsNetworks#42](https://github.com/AlmanaX-21/LogisticsNetworks/issues/42)'
  );
});

function reply(index: number, overrides: Partial<ThreadReply> = {}): ThreadReply {
  return {
    author: `Member ${index}`,
    content: `reply ${index}`,
    attachments: [],
    createdAt: new Date(Date.UTC(2026, 9, 4, 14, index)),
    ...overrides
  };
}

test('buildConversationComments renders replies under one heading', () => {
  assert.deepEqual(buildConversationComments([reply(0), reply(3)]), [[
    '### Discord conversation',
    '',
    '**Member 0** · 2026-10-04 14:00 UTC',
    'reply 0',
    '',
    '**Member 3** · 2026-10-04 14:03 UTC',
    'reply 3'
  ].join('\n')]);
});

test('buildConversationComments neutralizes mentions and lists attachments', () => {
  const [comment] = buildConversationComments([reply(1, {
    author: '@Marko',
    content: 'ping @Almana',
    attachments: [{ name: 'log[1].txt', url: 'https://cdn.discordapp.com/log.txt' }]
  })]);

  assert.ok(comment.includes('**@\u200BMarko** · 2026-10-04 14:01 UTC\nping @\u200BAlmana\n'));
  assert.ok(comment.endsWith('- [log\\[1\\].txt](https://cdn.discordapp.com/log.txt)'));
});

test('buildConversationComments keeps attachment-only replies and skips empty ones', () => {
  const [comment] = buildConversationComments([
    reply(1, { content: ' ' }),
    reply(2, { content: '', attachments: [{ name: 'shot.png', url: 'https://cdn.discordapp.com/shot.png' }] })
  ]);

  assert.equal(comment, [
    '### Discord conversation',
    '',
    '**Member 2** · 2026-10-04 14:02 UTC',
    '- [shot.png](https://cdn.discordapp.com/shot.png)'
  ].join('\n'));
});

test('buildConversationComments returns nothing without replies', () => {
  assert.deepEqual(buildConversationComments([]), []);
  assert.deepEqual(buildConversationComments([reply(1, { content: '' })]), []);
});

test('buildConversationComments splits long conversations at reply boundaries', () => {
  const replies = Array.from({ length: 30 }, (_, index) => reply(index, { content: 'x'.repeat(3_000) }));

  const comments = buildConversationComments(replies);

  assert.equal(comments.length, 2);
  assert.ok(comments.every(comment => comment.length <= 65_000));
  assert.ok(comments[0].startsWith('### Discord conversation\n\n**Member 0**'));
  assert.ok(comments[1].startsWith('**Member '));
  assert.equal((comments.join('\n\n').match(/\*\*Member \d+\*\*/gu) ?? []).length, 30);
});
