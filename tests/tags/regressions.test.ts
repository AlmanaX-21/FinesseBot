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
  const directMessages: CapturedPayload[] = [];
  const message = {
    content,
    guildId: 'guild-1',
    author: {
      id: 'user-1',
      send: async (payload: CapturedPayload) => {
        if (dmError) throw dmError;
        directMessages.push(payload);
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

  return { message, channelMessages, directMessages };
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

test('release tags answer when the live tag directory lacks them', async () => {
  const liveDirectory = await mkdtemp(join(tmpdir(), 'finesse-live-tags-'));
  const releaseDirectory = await mkdtemp(join(tmpdir(), 'finesse-release-tags-'));

  try {
    await writeFile(join(releaseDirectory, 'tutorials.md'), 'Tutorial links', 'utf-8');
    const fixture = createMessage('!tutorials');
    const options = {
      prefix: '!',
      tagsPath: liveDirectory,
      fallbackTagsPath: releaseDirectory
    };
    const handleTagMessage = createTagHandler(options);

    assert.equal(await handleTagMessage(fixture.message), true);
    assert.equal(fixture.channelMessages[0].content, 'Tutorial links');
  } finally {
    await Promise.all([
      rm(liveDirectory, { recursive: true, force: true }),
      rm(releaseDirectory, { recursive: true, force: true })
    ]);
  }
});

test('tag-list includes release tags missing from the live directory', async () => {
  const liveDirectory = await mkdtemp(join(tmpdir(), 'finesse-live-tag-list-'));
  const releaseDirectory = await mkdtemp(join(tmpdir(), 'finesse-release-tag-list-'));

  try {
    await writeFile(join(releaseDirectory, 'scaling.md'), 'Scaling guide', 'utf-8');
    const fixture = createMessage('!tag-list');
    const options = {
      prefix: '!',
      tagsPath: liveDirectory,
      fallbackTagsPath: releaseDirectory
    };
    const handleTagMessage = createTagHandler(options);

    assert.equal(await handleTagMessage(fixture.message), true);
    assert.match(fixture.directMessages[0].content, /!scaling/u);
  } finally {
    await Promise.all([
      rm(liveDirectory, { recursive: true, force: true }),
      rm(releaseDirectory, { recursive: true, force: true })
    ]);
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
