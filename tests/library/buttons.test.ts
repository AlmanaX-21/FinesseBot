import test from 'node:test';
import assert from 'node:assert/strict';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { handleNetworkButton } from '../../src/library/buttons.js';
import { SavedSearch, saveSearch } from '../../src/library/searches.js';
import { details, fakeInteraction, flagsOf, jsonResponse, networks, nodesOf, stubFetch, textsOf, walk } from './fixtures.js';

function savedSearch() {
  const search: SavedSearch = { userId: 'user-1', query: 'bee', offset: 0, total: 12, results: networks(5) };
  return { search, token: saveSearch(search) };
}

const press = (customId: string, userId = 'user-1') =>
  fakeInteraction<ButtonInteraction>({ customId, user: { id: userId } });

test('network buttons', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('asks to search again when the token expired', async () => {
    const { interaction, sent } = press('net:page:gone:5');
    await handleNetworkButton(interaction);
    assert.equal(sent[0].method, 'reply');
    assert.equal(flagsOf(sent[0].payload), MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    assert.match(textsOf(nodesOf(sent[0].payload))[0], /expired/u);
  });

  await t.test('rejects other users', async () => {
    const { token } = savedSearch();
    const requests = stubFetch(() => jsonResponse({}));
    const { interaction, sent } = press(`net:page:${token}:5`, 'user-2');
    await handleNetworkButton(interaction);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'reply');
    assert.equal(flagsOf(sent[0].payload), MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    assert.equal(requests.length, 0);
    assert.match(textsOf(nodesOf(sent[0].payload))[0], /Only the person who ran this search/u);
  });

  await t.test('loads the next page in place', async () => {
    const { search, token } = savedSearch();
    const requests = stubFetch(() => jsonResponse({ total: 12, results: networks(5) }));
    const { interaction, sent } = press(`net:page:${token}:5`);

    await handleNetworkButton(interaction);

    assert.equal(requests[0].url.searchParams.get('offset'), '5');
    assert.deepEqual(sent.map(call => call.method), ['deferUpdate', 'editReply']);
    assert.equal(search.offset, 5);
    assert.match(textsOf(nodesOf(sent[1].payload))[0], /page 2\/3/u);
  });

  await t.test('shows a network with Back and Share', async () => {
    const { token } = savedSearch();
    const requests = stubFetch(() => jsonResponse(details()));
    const { interaction, sent } = press(`net:view:${token}:2`);

    await handleNetworkButton(interaction);

    assert.equal(requests[0].url.searchParams.get('id'), 'net-2.lnet');
    const ids = walk(nodesOf(sent[1].payload)).flatMap(node => node.custom_id ?? []);
    assert.deepEqual(ids, [`net:back:${token}`, `net:share:${token}:2`]);
  });

  await t.test('returns to the cached results page', async () => {
    const { token } = savedSearch();
    const requests = stubFetch(() => jsonResponse({}));
    const { interaction, sent } = press(`net:back:${token}`);

    await handleNetworkButton(interaction);

    assert.equal(requests.length, 0);
    assert.equal(sent[0].method, 'update');
    assert.match(textsOf(nodesOf(sent[0].payload))[0], /12 networks/u);
  });

  await t.test('shares the network publicly', async () => {
    const { token } = savedSearch();
    stubFetch(() => jsonResponse(details()));
    const { interaction, sent } = press(`net:share:${token}:0`);

    await handleNetworkButton(interaction);

    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'editReply']);
    assert.equal(flagsOf(sent[1].payload), MessageFlags.IsComponentsV2);
  });

  await t.test('reports a removed network ephemerally', async () => {
    const { token } = savedSearch();
    stubFetch(() => jsonResponse({ error: 'not-found' }, 404));
    const { interaction, sent } = press(`net:view:${token}:0`);

    await handleNetworkButton(interaction);

    assert.deepEqual(sent.map(call => call.method), ['deferUpdate', 'followUp']);
    assert.equal(flagsOf(sent[1].payload), MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    assert.deepEqual(textsOf(nodesOf(sent[1].payload)), ["That network isn't in the library any more."]);
  });

  await t.test('asks to search again when the result moved', async () => {
    const { search, token } = savedSearch();
    search.results = networks(2);
    const requests = stubFetch(() => jsonResponse(details()));
    const { interaction, sent } = press(`net:view:${token}:4`);

    await handleNetworkButton(interaction);

    assert.equal(requests.length, 0);
    assert.equal(sent[0].method, 'reply');
    assert.equal(flagsOf(sent[0].payload), MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    assert.match(textsOf(nodesOf(sent[0].payload))[0], /moved/u);
  });
});
