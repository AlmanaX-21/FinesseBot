import test from 'node:test';
import assert from 'node:assert/strict';
import { ComponentType } from 'discord.js';
import { accentFor, cut, detailCard, fallbackCard, linkCard } from '../../src/library/cards.js';
import { SITE, details, network, textsOf, toNodes, walk } from './fixtures.js';

test('network cards', async (t) => {
  await t.test('cuts long text with an ellipsis', () => {
    assert.equal(cut('abcdef', 10), 'abcdef');
    assert.equal(cut('abcdefghij', 5), 'abcd…');
    assert.equal(cut('ab😀cd', 4), 'ab…');
  });

  await t.test('shows no resources for an untyped network', () => {
    assert.equal(
      textsOf(toNodes(detailCard(details({ types: [] }))))[0],
      '## Eldritch Automation\nby **AlmanaX21** · curated · no resources'
    );
  });

  await t.test('neutralises masked links and headings in descriptions', () => {
    const raw = '# Huge\n[legit.com](https://phish.example)';
    const description = textsOf(toNodes(detailCard(details({ description: raw }))))[1];
    assert.notEqual(description, raw);
    assert.ok(!description.startsWith('# '));
    assert.ok(!/(^|[^\\])\[legit\.com\]\(https/.test(description));
    assert.equal(description, '\\# Huge\n\\[legit.com](https://phish.example)');
  });

  await t.test('keeps the stats line alone when labels are blank', () => {
    const blank = [{ label: '  ', visible: true, type: null }];
    assert.equal(
      textsOf(toNodes(detailCard(details({ nodes: blank }))))[2],
      '**3** nodes · **3** links · **6** channels'
    );
  });

  await t.test('picks the accent from the first resource type', () => {
    assert.equal(accentFor(network({ types: ['FLUID', 'ITEM'] })), 0x81a1c1);
    assert.equal(accentFor(network({ types: [] })), 0x5fb3b3);
  });

  await t.test('builds the detail card', () => {
    const nodes = toNodes(detailCard(details()));
    const [container] = nodes;

    assert.equal(nodes.length, 1);
    assert.equal(container.type, ComponentType.Container);
    assert.equal(container.accent_color, 0xe5b567);
    assert.deepEqual(container.components?.map(component => component.type), [
      ComponentType.TextDisplay,
      ComponentType.TextDisplay,
      ComponentType.MediaGallery,
      ComponentType.Separator,
      ComponentType.TextDisplay,
      ComponentType.ActionRow
    ]);
    assert.deepEqual(textsOf(nodes), [
      '## Eldritch Automation\nby **AlmanaX21** · curated · ITEM',
      'Eldritch Miner with auto repair',
      '**3** nodes · **3** links · **6** channels\nOre Store, Mineshaft, XP Tank'
    ]);
    const item = container.components?.[2].items?.[0];
    assert.equal(item?.media.url, `${SITE}/api/library/image.png?id=eldritch-automation.lnet`);
    assert.equal(item?.description, 'Eldritch Automation network graph');
    const buttons = walk(nodes).filter(node => node.type === ComponentType.Button);
    assert.deepEqual(buttons.map(button => [button.label, button.url]), [
      ['Open in visualiser', `${SITE}/visualiser.html?net=eldritch-automation.lnet`],
      ['Download .lnet', `${SITE}/library/eldritch-automation.lnet`]
    ]);
    assert.ok(walk(nodes).length <= 40);
  });

  await t.test('cuts the node label list to about 300 characters', () => {
    const labels = Array.from({ length: 80 }, (_, i) => ({ label: `Storage Node ${i}`, visible: true, type: 'ITEM' as const }));
    const stats = textsOf(toNodes(detailCard(details({ nodes: labels }))))[2];
    const line = stats.split('\n')[1];
    assert.ok(line.length <= 300);
    assert.ok(line.endsWith('…'));
  });

  await t.test('skips an empty description', () => {
    assert.equal(textsOf(toNodes(detailCard(details({ description: '  ' })))).length, 2);
  });

  await t.test('escapes markdown in community text', () => {
    const heading = textsOf(toNodes(detailCard(details({ name: 'bee_farm *v2*' }))))[0];
    assert.match(heading, /^## bee\\_farm \\\*v2\\\*\n/);
  });

  await t.test('builds the fallback card without image or stats', () => {
    const nodes = toNodes(fallbackCard(network()));
    const texts = textsOf(nodes);
    assert.ok(!walk(nodes).some(node => node.type === ComponentType.MediaGallery));
    assert.equal(texts.length, 3);
    assert.match(texts[2], /too large or can't be read/);
    assert.equal(nodes[0].components?.at(-1)?.type, ComponentType.ActionRow);
  });

  await t.test('builds the link card with a copyable URL', () => {
    const nodes = toNodes(linkCard(network()));
    assert.deepEqual(textsOf(nodes), [
      `**Eldritch Automation** by AlmanaX21\n${SITE}/visualiser.html?net=eldritch-automation.lnet`
    ]);
    assert.equal(walk(nodes).filter(node => node.type === ComponentType.Button).length, 2);
  });
});
