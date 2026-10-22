import test from 'node:test';
import assert from 'node:assert/strict';
import { ComponentType, MessageFlags, RepliableInteraction } from 'discord.js';
import { LibraryError } from '../../src/library/api.js';
import { notice } from '../../src/library/cards.js';
import { detailFor, sendPublic } from '../../src/library/replies.js';
import { details, fakeInteraction, flagsOf, jsonResponse, network, nodesOf, stubFetch, textsOf, toNodes, walk } from './fixtures.js';

test('library replies', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('edits the deferred reply with a V2 card and no pings', async () => {
    const { interaction, sent } = fakeInteraction<RepliableInteraction>();

    await sendPublic(interaction, async () => notice('card'));

    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'editReply']);
    assert.equal(sent[0].payload, undefined);
    assert.equal(flagsOf(sent[1].payload), MessageFlags.IsComponentsV2);
    assert.deepEqual((sent[1].payload as { allowedMentions: unknown }).allowedMentions, { parse: [] });
  });

  await t.test('swaps a message for an ephemeral follow-up', async () => {
    const { interaction, sent } = fakeInteraction<RepliableInteraction>();

    await sendPublic(interaction, async () => 'No network matches “x”.');

    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'deleteReply', 'followUp']);
    assert.equal(flagsOf(sent[2].payload), MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    assert.deepEqual(textsOf(nodesOf(sent[2].payload)), ['No network matches “x”.']);
  });

  await t.test('turns library errors into ephemeral messages', async () => {
    const { interaction, sent } = fakeInteraction<RepliableInteraction>();

    await sendPublic(interaction, async () => {
      throw new LibraryError(429, 'rate-limited');
    });

    assert.deepEqual(textsOf(nodesOf(sent[2].payload)), ['The library is busy, try again in a minute.']);
  });

  await t.test('keeps unexpected errors private', async () => {
    const { interaction, sent } = fakeInteraction<RepliableInteraction>();

    await sendPublic(interaction, async () => {
      throw new Error('boom');
    });

    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'deleteReply', 'followUp']);
    assert.equal(flagsOf(sent[2].payload), MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    assert.deepEqual(textsOf(nodesOf(sent[2].payload)), ['Something went wrong, try again later.']);
  });

  await t.test('keeps a rejected edit private', async () => {
    const { interaction, sent } = fakeInteraction<RepliableInteraction>({
      editReply: async () => {
        throw new Error('Invalid Form Body');
      }
    });

    await sendPublic(interaction, async () => notice('card'));

    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'deleteReply', 'followUp']);
    assert.equal(flagsOf(sent[2].payload), MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    assert.deepEqual(textsOf(nodesOf(sent[2].payload)), ['Something went wrong, try again later.']);
  });

  await t.test('builds the detail card from network details', async () => {
    const requests = stubFetch(() => jsonResponse(details()));
    const nodes = toNodes(await detailFor(network()));
    assert.equal(requests[0].url.searchParams.get('id'), 'eldritch-automation.lnet');
    assert.ok(walk(nodes).some(node => node.type === ComponentType.MediaGallery));
  });

  await t.test('falls back to search data when details are unreadable', async () => {
    stubFetch(() => jsonResponse({ error: 'too-many-nodes' }, 422));
    const nodes = toNodes(await detailFor(network()));
    assert.ok(!walk(nodes).some(node => node.type === ComponentType.MediaGallery));
    assert.match(textsOf(nodes).join('\n'), /too large or can't be read/u);
  });
});
