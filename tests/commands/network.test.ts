import test from 'node:test';
import assert from 'node:assert/strict';
import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { networkCommand } from '../../src/commands/network.js';
import { refreshCatalog } from '../../src/library/catalog.js';
import {
  details,
  fakeInteraction,
  flagsOf,
  jsonResponse,
  network,
  networks,
  nodesOf,
  stubFetch,
  textsOf,
  walk
} from '../library/fixtures.js';
import { getSearch } from '../../src/library/searches.js';

interface OptionJson {
  name: string;
  autocomplete?: boolean;
  choices?: unknown[];
  options?: OptionJson[];
}

function run(subcommand: string, values: Record<string, string> = {}) {
  return fakeInteraction<ChatInputCommandInteraction>({
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => values[name] ?? null
    }
  });
}

test('network slash command', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('registers four subcommands with autocomplete on network options', () => {
    const json = networkCommand.data.toJSON();
    const subcommands = json.options as OptionJson[];
    assert.equal(json.name, 'network');
    assert.deepEqual(subcommands.map(option => option.name), ['search', 'show', 'link', 'random']);
    assert.equal(subcommands[1].options?.[0].autocomplete, true);
    assert.equal(subcommands[2].options?.[0].autocomplete, true);
    assert.equal(subcommands[0].options?.find(option => option.name === 'type')?.choices?.length, 5);
  });

  await t.test('searches ephemerally with trimmed filters', async () => {
    const requests = stubFetch(() => jsonResponse({ total: 1, results: [network()] }));
    const { interaction, sent } = run('search', { query: ' eldritch ', type: 'ITEM' });

    await networkCommand.execute(interaction);

    assert.equal(requests[0].url.search, '?q=eldritch&type=ITEM&limit=5&offset=0');
    assert.deepEqual(sent[0], { method: 'deferReply', payload: { flags: MessageFlags.Ephemeral } });
    assert.equal(flagsOf(sent[1].payload), MessageFlags.IsComponentsV2);
    assert.match(textsOf(nodesOf(sent[1].payload))[0], /1 network for “eldritch”/u);
    const view = walk(nodesOf(sent[1].payload)).find(node => node.label === 'View');
    const saved = getSearch(view!.custom_id!.split(':')[2]);
    assert.equal(saved?.userId, 'user-1');
    assert.equal(saved?.query, 'eldritch');
    assert.equal(saved?.type, 'ITEM');
  });

  await t.test('names an invalid type filter', async () => {
    stubFetch(() => jsonResponse({ error: 'bad-type' }, 400));
    const { interaction, sent } = run('search', { type: 'PLASMA' });

    await networkCommand.execute(interaction);

    assert.deepEqual(textsOf(nodesOf(sent[1].payload)), ["That resource type filter isn't valid."]);
  });

  await t.test('resolves a typed name through search before showing it', async () => {
    const requests = stubFetch(url => url.pathname.endsWith('/search')
      ? jsonResponse({ total: 1, results: [network()] })
      : jsonResponse(details()));
    const { interaction, sent } = run('show', { network: 'Eldritch' });

    await networkCommand.execute(interaction);

    assert.equal(requests[0].url.search, '?q=Eldritch&limit=1');
    assert.equal(requests[1].url.searchParams.get('id'), 'eldritch-automation.lnet');
    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'editReply']);
  });

  await t.test('says when a typed name matches nothing', async () => {
    stubFetch(() => jsonResponse({ total: 0, results: [] }));
    const { interaction, sent } = run('show', { network: 'nothing like this' });

    await networkCommand.execute(interaction);

    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'deleteReply', 'followUp']);
    assert.deepEqual(textsOf(nodesOf(sent[2].payload)), ['No network matches “nothing like this”.']);
  });

  await t.test('trims and escapes a typed name that matches nothing', async () => {
    const requests = stubFetch(() => jsonResponse({ total: 0, results: [] }));
    const { interaction, sent } = run('show', { network: '  *x*  ' });

    await networkCommand.execute(interaction);

    assert.equal(requests[0].url.search, '?q=*x*&limit=1');
    assert.deepEqual(textsOf(nodesOf(sent[2].payload)), ['No network matches “\\*x\\*”.']);
  });

  await t.test('random says when there is nothing to pick', async () => {
    const requests = stubFetch(() => jsonResponse({ total: 0, results: [] }));
    const { interaction, sent } = run('random');

    await networkCommand.execute(interaction);

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.search, '?limit=0');
    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'deleteReply', 'followUp']);
    assert.deepEqual(textsOf(nodesOf(sent[2].payload)), ['No networks to pick from.']);
  });

  await t.test('links a catalog network without calling the API', async () => {
    stubFetch(() => jsonResponse({ total: 1, results: [network()] }));
    await refreshCatalog();
    const requests = stubFetch(() => jsonResponse({}));
    const { interaction, sent } = run('link', { network: 'eldritch-automation.lnet' });

    await networkCommand.execute(interaction);

    assert.equal(requests.length, 0);
    assert.match(textsOf(nodesOf(sent[1].payload))[0], /^\*\*Eldritch Automation\*\* by AlmanaX21\nhttps:/u);
  });

  await t.test('shows a catalog network by its exact name', async () => {
    const requests = stubFetch(() => jsonResponse(details()));
    const { interaction, sent } = run('show', { network: 'eldritch automation' });

    await networkCommand.execute(interaction);

    assert.equal(requests.length, 1);
    assert.ok(requests[0].url.pathname.endsWith('/network'));
    assert.equal(requests[0].url.searchParams.get('id'), 'eldritch-automation.lnet');
    assert.deepEqual(sent.map(call => call.method), ['deferReply', 'editReply']);
  });

  await t.test('picks a random network below the total', async (st) => {
    st.mock.method(Math, 'random', () => 0.5);
    const requests = stubFetch(url => {
      if (url.pathname.endsWith('/network')) return jsonResponse(details());
      return jsonResponse(url.searchParams.get('limit') === '0'
        ? { total: 8, results: [] }
        : { total: 8, results: [network()] });
    });

    await networkCommand.execute(run('random', { type: 'FLUID' }).interaction);

    assert.deepEqual(requests.map(request => request.url.search), [
      '?type=FLUID&limit=0',
      '?type=FLUID&limit=1&offset=4',
      '?id=eldritch-automation.lnet'
    ]);
  });

  await t.test('autocompletes from the catalog', async () => {
    stubFetch(() => jsonResponse({ total: 30, results: networks(30) }));
    await refreshCatalog();
    const { interaction, sent } = fakeInteraction<AutocompleteInteraction>({ options: { getFocused: () => '' } });

    await networkCommand.autocomplete(interaction);

    assert.equal((sent[0].payload as unknown[]).length, 25);
  });
});
