import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueDraft, issueLink, reposForTags } from '../../src/issues/format.js';
import { ForumPost } from '../../src/issues/types.js';
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
