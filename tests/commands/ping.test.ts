import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatInputCommandInteraction } from 'discord.js';
import { commands } from '../../src/commands/index.js';

test('ping slash command replies with Pong!', async () => {
  const replies: Array<{ content: string }> = [];
  const pingCommand = commands.find(command => command.data.name === 'ping');

  assert.ok(pingCommand);

  const interaction = {
    reply: async (payload: { content: string }) => {
      replies.push(payload);
    }
  } as unknown as ChatInputCommandInteraction;

  await pingCommand.execute(interaction, {} as never, {} as never);

  assert.deepEqual(replies, [{ content: 'Pong!' }]);
});
