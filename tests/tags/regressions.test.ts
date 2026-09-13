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

function createMessage(content: string, users: string[] = [], dmError?: Error) {
  const channelMessages: CapturedPayload[] = [];
  const message = {
    content,
    guildId: 'guild-1',
    author: {
      id: 'user-1',
      send: async () => {
        if (dmError) throw dmError;
      }
    },
    channel: {
      send: async (payload: CapturedPayload) => {
        channelMessages.push(payload);
      }
    },
    member: { permissionsIn: () => ({ has: () => false }) },
    mentions: {
      users: new Map(users.map(id => [id, { id }])),
      roles: new Map()
    }
  } as unknown as Message<true>;

  return { message, channelMessages };
}

test('stored mentions stay disabled when the attention footer uses the same ID', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-stored-mention-'));

  try {
    await writeFile(join(directory, 'notice.md'), 'Stored mention: <@123>', 'utf-8');
    const fixture = createMessage('!notice <@123>', ['123']);
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    await handleTagMessage(fixture.message);

    assert.deepEqual(fixture.channelMessages, [
      {
        content: 'Stored mention: <@123>',
        allowedMentions: { parse: [], users: [], roles: [] }
      },
      {
        content: '**Attention:** <@123>',
        allowedMentions: { parse: [], users: ['123'], roles: [] }
      }
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('simultaneous invocations share the member cooldown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-concurrent-cooldown-'));

  try {
    await writeFile(join(directory, 'notice.md'), 'Notice', 'utf-8');
    const fixture = createMessage('!notice');
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    await Promise.all([
      handleTagMessage(fixture.message),
      handleTagMessage(fixture.message)
    ]);

    assert.equal(fixture.channelMessages.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an in-flight unknown tag does not discard the next valid invocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-unknown-queue-'));

  try {
    await writeFile(join(directory, 'notice.md'), 'Notice', 'utf-8');
    const unknown = createMessage('!missing');
    const valid = createMessage('!notice');
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    await Promise.all([
      handleTagMessage(unknown.message),
      handleTagMessage(valid.message)
    ]);

    assert.equal(valid.channelMessages.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an eight-thousand-character tag keeps attention in a separate final message', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-response-boundary-'));

  try {
    const response = 'x'.repeat(8_000);
    await writeFile(join(directory, 'notice.md'), response, 'utf-8');
    const fixture = createMessage('!notice <@123>', ['123']);
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    await handleTagMessage(fixture.message);

    assert.equal(fixture.channelMessages.length, 5);
    assert.equal(fixture.channelMessages.slice(0, 4).map(item => item.content).join(''), response);
    assert.equal(fixture.channelMessages[4].content, '**Attention:** <@123>');
    assert.deepEqual(fixture.channelMessages[4].allowedMentions?.users, ['123']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('tag-list propagates unexpected direct-message failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-dm-error-'));

  try {
    await writeFile(join(directory, 'notice.md'), 'Notice', 'utf-8');
    const error = Object.assign(new Error('Discord unavailable'), { code: 50_013 });
    const fixture = createMessage('!tag-list', [], error);
    const handleTagMessage = createTagHandler({ prefix: '!', tagsPath: directory });

    await assert.rejects(handleTagMessage(fixture.message), /Discord unavailable/u);
    assert.equal(fixture.channelMessages.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
