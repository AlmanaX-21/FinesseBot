import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { createIssueCommand } from '../../src/commands/issue.js';
import { IssueSync, SyncResult } from '../../src/issues/types.js';

interface ReplyPayload {
  content?: string;
  ephemeral?: boolean;
}

function createInteraction(channel: unknown = { isThread: () => true }) {
  const replies: ReplyPayload[] = [];
  let deferredEphemeral = false;
  const interaction = {
    channelId: 'thread-1',
    client: { channels: { fetch: async () => channel } },
    reply: async (payload: ReplyPayload) => {
      replies.push(payload);
    },
    deferReply: async (payload: ReplyPayload) => {
      deferredEphemeral = payload.ephemeral === true;
    },
    editReply: async (payload: ReplyPayload) => {
      replies.push(payload);
    }
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies, wasDeferredEphemeral: () => deferredEphemeral };
}

const syncReturning = (result: SyncResult): IssueSync => async () => result;

test('Issue slash command', async (t) => {
  await t.test('defaults to Manage Threads permission', () => {
    const json = createIssueCommand(null).data.toJSON();
    assert.equal(json.name, 'issue');
    assert.equal(json.default_member_permissions, String(PermissionFlagsBits.ManageThreads));
  });

  await t.test('reports missing GitHub configuration', async () => {
    const { interaction, replies } = createInteraction();
    await createIssueCommand(null).execute(interaction);
    assert.deepEqual(replies, [{ content: '❌ GitHub integration is not configured.', ephemeral: true }]);
  });

  await t.test('rejects channels that are not forum posts', async () => {
    const { interaction, replies, wasDeferredEphemeral } = createInteraction({ isThread: () => false });
    await createIssueCommand(syncReturning({ status: 'synced', created: [], existing: [], errors: [] }))
      .execute(interaction);
    assert.equal(wasDeferredEphemeral(), true);
    assert.deepEqual(replies, [{ content: '⚠️ Run this inside a post in a tracked forum.' }]);
  });

  await t.test('syncs the post fetched by channel id', async () => {
    const post = { isThread: () => true };
    const { interaction } = createInteraction(post);
    let synced: unknown;

    await createIssueCommand(async thread => {
      synced = thread;
      return { status: 'untagged' };
    }).execute(interaction);

    assert.equal(synced, post);
  });

  await t.test('treats unknown channels as untracked', async () => {
    const { interaction, replies } = createInteraction(null);
    await createIssueCommand(syncReturning({ status: 'untagged' })).execute(interaction);
    assert.deepEqual(replies, [{ content: '⚠️ Run this inside a post in a tracked forum.' }]);
  });

  await t.test('explains untagged posts', async () => {
    const { interaction, replies, wasDeferredEphemeral } = createInteraction();
    await createIssueCommand(syncReturning({ status: 'untagged' })).execute(interaction);
    assert.equal(wasDeferredEphemeral(), true);
    assert.deepEqual(replies, [{ content: '⚠️ Add a mod tag to this post first.' }]);
  });

  await t.test('lists created, existing and failed issues', async () => {
    const { interaction, replies } = createInteraction();
    const sync = syncReturning({
      status: 'synced',
      created: [{ repo: 'AlmanaX-21/OtherMod', issue_number: 2, issue_url: 'https://github.com/AlmanaX-21/OtherMod/issues/2' }],
      existing: [{ repo: 'AlmanaX-21/LogisticsNetworks', issue_number: 1, issue_url: 'https://github.com/AlmanaX-21/LogisticsNetworks/issues/1' }],
      errors: ['GitHub 404 for AlmanaX-21/ThirdMod: Not Found']
    });

    await createIssueCommand(sync).execute(interaction);

    assert.deepEqual(replies, [{
      content: [
        '✅ Created [AlmanaX-21/OtherMod#2](https://github.com/AlmanaX-21/OtherMod/issues/2)',
        '🔗 Already tracked: [AlmanaX-21/LogisticsNetworks#1](https://github.com/AlmanaX-21/LogisticsNetworks/issues/1)',
        '❌ GitHub 404 for AlmanaX-21/ThirdMod: Not Found'
      ].join('\n')
    }]);
  });
});
