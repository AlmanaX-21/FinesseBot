import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Message } from 'discord.js';
import { createTagHandler } from '../../src/tags/handler.js';

interface CapturedPayload {
  content: string;
  allowedMentions?: {
    parse?: readonly string[];
    users?: readonly string[];
    roles?: readonly string[];
  };
}

interface MessageFixtureOptions {
  userId?: string;
  users?: string[];
  roles?: Array<{ id: string; mentionable: boolean }>;
  canMentionEveryone?: boolean;
  dmFails?: boolean;
}

function createMessageFixture(content: string, options: MessageFixtureOptions = {}) {
  const channelMessages: CapturedPayload[] = [];
  const directMessages: CapturedPayload[] = [];
  const users = new Map((options.users || []).map(id => [id, { id }]));
  const roles = new Map((options.roles || []).map(role => [role.id, role]));
  const message = {
    content,
    guildId: 'guild-1',
    author: {
      id: options.userId || 'user-1',
      send: async (payload: CapturedPayload) => {
        if (options.dmFails) {
          throw Object.assign(new Error('DMs disabled'), { code: 50_007 });
        }
        directMessages.push(payload);
      }
    },
    channel: {
      send: async (payload: CapturedPayload) => {
        channelMessages.push(payload);
      }
    },
    member: {
      permissionsIn: () => ({
        has: () => options.canMentionEveryone || false
      })
    },
    mentions: { users, roles }
  } as unknown as Message<true>;

  return { message, channelMessages, directMessages };
}

test('tag responses append unique permitted user and role pings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-'));

  try {
    await writeFile(
      join(directory, 'question.md'),
      'Saved answer with <@999> and @everyone.',
      'utf-8'
    );
    const fixture = createMessageFixture(
      '!Question extra <@123> <@!123> <@&456> <@&789> @everyone',
      {
        users: ['123'],
        roles: [
          { id: '456', mentionable: true },
          { id: '789', mentionable: false }
        ]
      }
    );
    const handleTagMessage = createTagHandler({
      prefix: '!',
      tagsPath: directory,
      cooldownMs: 5_000
    });

    assert.equal(await handleTagMessage(fixture.message), true);
    assert.deepEqual(fixture.channelMessages, [
      {
        content: 'Saved answer with <@999> and @everyone.',
        allowedMentions: { parse: [], users: [], roles: [] }
      },
      {
        content: '**Attention:** <@123> <@&456>',
        allowedMentions: { parse: [], users: ['123'], roles: ['456'] }
      }
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('senders with Mention Everyone can carry a non-mentionable role ping', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-role-'));

  try {
    await writeFile(join(directory, 'notice.md'), 'Notice', 'utf-8');
    const fixture = createMessageFixture('!notice <@&789>', {
      roles: [{ id: '789', mentionable: false }],
      canMentionEveryone: true
    });
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    await handleTagMessage(fixture.message);

    assert.equal(fixture.channelMessages[1].content, '**Attention:** <@&789>');
    assert.deepEqual(fixture.channelMessages[1].allowedMentions?.roles, ['789']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('tag responses carry at most ten unique pings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-limit-'));

  try {
    await writeFile(join(directory, 'notice.md'), 'Notice', 'utf-8');
    const userIds = Array.from({ length: 12 }, (_, index) => `${index + 100}`);
    const pings = userIds.map(id => `<@${id}>`).join(' ');
    const fixture = createMessageFixture(`!notice ${pings}`, { users: userIds });
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    await handleTagMessage(fixture.message);

    assert.deepEqual(
      fixture.channelMessages[1].allowedMentions?.users,
      userIds.slice(0, 10)
    );
    assert.doesNotMatch(fixture.channelMessages[1].content, /<@110>/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('tag cooldown applies per member and expires', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-cooldown-'));

  try {
    await writeFile(join(directory, 'notice.md'), 'Notice', 'utf-8');
    const firstMember = createMessageFixture('!notice', { userId: 'user-1' });
    const secondMember = createMessageFixture('!notice', { userId: 'user-2' });
    const handleTagMessage = createTagHandler({
      prefix: '!',
      tagsPath: directory,
      cooldownMs: 30
    });

    assert.equal(await handleTagMessage(firstMember.message), true);
    assert.equal(await handleTagMessage(firstMember.message), true);
    assert.equal(firstMember.channelMessages.length, 1);

    await handleTagMessage(secondMember.message);
    assert.equal(secondMember.channelMessages.length, 1);

    await new Promise(resolve => setTimeout(resolve, 35));
    await handleTagMessage(firstMember.message);
    assert.equal(firstMember.channelMessages.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unknown tags remain silent and do not start a cooldown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-unknown-'));

  try {
    const fixture = createMessageFixture('!new-tag');
    const handleTagMessage = createTagHandler({
      prefix: '!',
      tagsPath: directory,
      cooldownMs: 5_000
    });

    assert.equal(await handleTagMessage(fixture.message), false);
    assert.equal(fixture.channelMessages.length, 0);

    await writeFile(join(directory, 'new-tag.md'), 'Now available', 'utf-8');
    assert.equal(await handleTagMessage(fixture.message), true);
    assert.equal(fixture.channelMessages[0].content, 'Now available');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('tag-list DMs a sorted paginated list and observes cooldown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-list-'));

  try {
    const names = Array.from(
      { length: 40 },
      (_, index) => `tag-${String(39 - index).padStart(2, '0')}-${'x'.repeat(48)}`
    );
    await Promise.all(names.map(name => writeFile(join(directory, `${name}.md`), name, 'utf-8')));
    const fixture = createMessageFixture('!tag-list <@123>', { users: ['123'] });
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    assert.equal(await handleTagMessage(fixture.message), true);
    assert.ok(fixture.directMessages.length > 1);
    assert.ok(fixture.directMessages.every(payload => payload.content.length <= 2_000));
    assert.equal(
      fixture.directMessages.map(payload => payload.content).join(''),
      `**Available tags (40)**\n${names.sort().map(name => `!${name}`).join('\n')}`
    );
    assert.equal(fixture.channelMessages.length, 0);

    await handleTagMessage(fixture.message);
    assert.equal(fixture.directMessages.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('tag-list reports when direct messages are disabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-dm-failure-'));

  try {
    await writeFile(join(directory, 'help.md'), 'Help', 'utf-8');
    const fixture = createMessageFixture('!tag-list', { dmFails: true });
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    assert.equal(await handleTagMessage(fixture.message), true);
    assert.match(fixture.channelMessages[0].content, /enable direct messages/u);
    assert.deepEqual(fixture.channelMessages[0].allowedMentions?.parse, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('tag-list explains when no tags are configured', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-handler-empty-list-'));

  try {
    const fixture = createMessageFixture('!tag-list');
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    assert.equal(await handleTagMessage(fixture.message), true);
    assert.equal(fixture.directMessages[0].content, 'No tags are configured yet.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
