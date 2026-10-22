import test from 'node:test';
import assert from 'node:assert/strict';
import { findNetwork, refreshCatalog, suggestNetworks } from '../../src/library/catalog.js';
import { jsonResponse, network, networks, stubFetch } from './fixtures.js';

test('network catalog', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const library = networks(120);

  await t.test('pages through search until the total is loaded', async () => {
    const requests = stubFetch(url => {
      const offset = Number(url.searchParams.get('offset'));
      return jsonResponse({ total: library.length, results: library.slice(offset, offset + 50) });
    });

    await refreshCatalog();

    assert.deepEqual(requests.map(request => request.url.search), [
      '?limit=50&offset=0',
      '?limit=50&offset=50',
      '?limit=50&offset=100'
    ]);
    assert.equal(findNetwork('net-119.lnet')?.name, 'Network 119');
  });

  await t.test('suggests the newest 25 for empty input', () => {
    const choices = suggestNetworks('  ');
    assert.equal(choices.length, 25);
    assert.deepEqual(choices[0], { name: 'Network 0', value: 'net-0.lnet' });
  });

  await t.test('finds a network by exact name, ignoring case', () => {
    assert.equal(findNetwork('network 7')?.id, 'net-7.lnet');
    assert.equal(findNetwork('network'), undefined);
  });

  await t.test('filters by name or author, ignoring case', () => {
    assert.deepEqual(
      suggestNetworks('NETWORK 11').map(choice => choice.value),
      ['net-11.lnet', ...Array.from({ length: 10 }, (_, i) => `net-11${i}.lnet`)]
    );
    assert.equal(suggestNetworks('almanax').length, 25);
  });

  await t.test('matches every word and the id', () => {
    const choices = suggestNetworks('network 7 almanax');
    assert.ok(choices.some(choice => choice.value === 'net-7.lnet'));
    assert.ok(choices.every(choice => choice.name.includes('7') && choice.name.includes('Network')));
    assert.deepEqual(suggestNetworks('net-42.lnet'), [{ name: 'Network 42', value: 'net-42.lnet' }]);
  });

  await t.test('keeps the previous list when a refresh fails', async () => {
    stubFetch(url => url.searchParams.get('offset') === '0'
      ? jsonResponse({ total: library.length, results: library.slice(0, 50) })
      : jsonResponse({ error: 'rate-limited' }, 429));
    await assert.rejects(refreshCatalog());
    assert.ok(findNetwork('net-119.lnet'));
  });

  await t.test('cuts long names to 100 characters', async () => {
    stubFetch(() => jsonResponse({ total: 1, results: [network({ name: 'x'.repeat(150) })] }));
    await refreshCatalog();
    assert.equal(suggestNetworks('')[0].name.length, 100);
    assert.ok(suggestNetworks('')[0].name.endsWith('…'));
  });

  await t.test('never splits an emoji in a long name', async () => {
    stubFetch(() => jsonResponse({ total: 1, results: [network({ name: '🔥'.repeat(60) })] }));
    await refreshCatalog();
    assert.equal(suggestNetworks('')[0].name, '🔥'.repeat(49) + '…');
  });

  await t.test('skips the re-read when the library is unchanged', async () => {
    stubFetch(() => new Response(JSON.stringify({ total: 2, results: networks(2) }), { headers: { ETag: '"v1"' } }));
    await refreshCatalog();
    const requests = stubFetch(() => new Response(null, { status: 304 }));

    await refreshCatalog();

    assert.equal(requests.length, 1);
    assert.equal((requests[0].init.headers as Record<string, string>)['If-None-Match'], '"v1"');
    assert.equal(suggestNetworks('').length, 2);
  });

  await t.test('re-reads every page when the library changed', async () => {
    const requests = stubFetch(url => {
      const offset = Number(url.searchParams.get('offset'));
      return new Response(JSON.stringify({ total: library.length, results: library.slice(offset, offset + 50) }), {
        headers: { ETag: '"v2"' }
      });
    });

    await refreshCatalog();

    assert.equal(requests.length, 3);
    assert.equal((requests[0].init.headers as Record<string, string>)['If-None-Match'], '"v1"');
    assert.ok(findNetwork('net-119.lnet'));
  });

  await t.test('stops when a page comes back empty', async () => {
    const requests = stubFetch(() => jsonResponse({ total: 10, results: [] }));
    await refreshCatalog();
    assert.equal(requests.length, 1);
    assert.deepEqual(suggestNetworks(''), []);
  });
});
