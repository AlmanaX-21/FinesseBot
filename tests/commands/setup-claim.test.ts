import test from 'node:test';
import assert from 'node:assert/strict';
import { setupClaimCommand } from '../../src/commands/setup-claim.js';

test('Setup Claim Slash Command', async (t) => {
  await t.test('command metadata is properly configured', () => {
    assert.equal(setupClaimCommand.data.name, 'setup-claim');
    assert.ok(setupClaimCommand.data.description.includes('claim'));
  });

  await t.test('execute sends claim panel to channel', async () => {
    let sentEmbeds: any[] = [];
    let sentComponents: any[] = [];
    let repliedContent = '';

    const mockChannel = {
      isTextBased: () => true,
      send: async (payload: any) => {
        sentEmbeds = payload.embeds;
        sentComponents = payload.components;
      }
    };

    const mockInteraction = {
      guild: { id: 'guild-123' },
      channel: mockChannel,
      options: {
        getChannel: () => null
      },
      reply: async (payload: any) => {
        repliedContent = payload.content;
      }
    } as any;

    await setupClaimCommand.execute(mockInteraction);

    assert.equal(sentEmbeds.length, 1);
    assert.equal(sentComponents.length, 1);
    assert.ok(repliedContent.includes('Claim panel posted'));
  });
});
