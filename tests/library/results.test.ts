import test from 'node:test';
import assert from 'node:assert/strict';
import { ComponentType } from 'discord.js';
import { resultsCard, viewRow } from '../../src/library/results.js';
import { SavedSearch } from '../../src/library/searches.js';
import { Node, network, networks, textsOf, toNodes, walk } from './fixtures.js';

function saved(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return { userId: 'user-1', query: 'bee', type: 'ITEM', offset: 0, total: 12, results: networks(5), ...overrides };
}

test('search results card', async (t) => {
  await t.test('lists five results with view buttons', () => {
    const nodes = toNodes(resultsCard(saved(), 'tok'));
    assert.equal(textsOf(nodes)[0], '### 12 networks for “bee” · type ITEM · page 1/3');
    assert.equal(walk(nodes).filter(node => node.type === ComponentType.Section).length, 5);
    assert.deepEqual(
      walk(nodes).filter(node => node.label === 'View').map(node => node.custom_id),
      [0, 1, 2, 3, 4].map(i => `net:view:tok:${i}`)
    );
  });

  await t.test('stays within component and custom id limits', () => {
    const nodes = walk(toNodes(resultsCard(saved(), 'abcdefgh')));
    const ids = nodes.flatMap(node => node.custom_id ?? []);
    assert.ok(nodes.length <= 40, `${nodes.length} components`);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every(id => id.length <= 100));
  });

  await t.test('disables Prev on the first page and Next on the last', () => {
    const first = walk(toNodes(resultsCard(saved(), 'tok')));
    assert.equal(first.find(node => node.label === '◀ Prev')?.disabled, true);
    assert.equal(first.find(node => node.label === 'Next ▶')?.disabled, false);
    assert.equal(first.find(node => node.label === 'Next ▶')?.custom_id, 'net:page:tok:5');

    const last = walk(toNodes(resultsCard(saved({ offset: 10, results: networks(2) }), 'tok')));
    assert.equal(last.find(node => node.label === '◀ Prev')?.disabled, false);
    assert.equal(last.find(node => node.label === 'Next ▶')?.disabled, true);
    assert.equal(last.find(node => node.label === '3/3')?.disabled, true);
  });

  await t.test('cuts long descriptions to one short line', () => {
    const long = network({ description: `Line one\n${'x'.repeat(300)}` });
    const line = textsOf(toNodes(resultsCard(saved({ results: [long], total: 1 }), 'tok')))[1];
    const description = line.split('\n')[1];
    assert.ok(description.startsWith('-# Line one x'));
    assert.ok(description.length <= '-# '.length + 120);
    assert.ok(description.endsWith('…'));
  });

  await t.test('explains an empty result', () => {
    const nodes = toNodes(resultsCard(saved({ total: 0, results: [] }), 'tok'));
    assert.deepEqual(textsOf(nodes), [
      '### No networks match · “bee” · type ITEM\nTry fewer words, or drop the type or author filter.'
    ]);
    assert.ok(!walk(nodes).some(node => node.type === ComponentType.Button));
  });

  await t.test('titles a filterless search with one result', () => {
    const nodes = toNodes(resultsCard(saved({ query: undefined, type: undefined, total: 1, results: [network()] }), 'tok'));
    assert.equal(textsOf(nodes)[0], '### 1 network · page 1/1');
  });

  await t.test('adds Back and Share buttons to a viewed network', () => {
    const row = viewRow('tok', 3).toJSON() as Node;
    assert.deepEqual(row.components?.map(button => button.custom_id), ['net:back:tok', 'net:share:tok:3']);
  });
});
