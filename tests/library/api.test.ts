import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryError, errorMessage, getNetwork, searchIfChanged, searchNetworks } from '../../src/library/api.js';
import { SITE, jsonResponse, network, stubFetch } from './fixtures.js';

test('library API client', async (t) => {
  delete process.env.LNET_BASE_URL;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.LNET_BASE_URL;
  });

  await t.test('builds the search query from set filters only', async () => {
    const requests = stubFetch(() => jsonResponse({ total: 1, results: [network()] }));

    const page = await searchNetworks({ q: 'bee farm', type: 'ITEM', author: undefined, limit: 5, offset: 10 });

    assert.equal(page.total, 1);
    assert.equal(String(requests[0].url), `${SITE}/api/library/search?q=bee+farm&type=ITEM&limit=5&offset=10`);
  });

  await t.test('keeps a zero limit', async () => {
    const requests = stubFetch(() => jsonResponse({ total: 7, results: [] }));
    await searchNetworks({ limit: 0 });
    assert.equal(requests[0].url.search, '?limit=0');
  });

  await t.test('encodes network ids', async () => {
    const requests = stubFetch(() => jsonResponse({}));
    await getNetwork('a b&c.lnet');
    assert.equal(String(requests[0].url), `${SITE}/api/library/network?id=a+b%26c.lnet`);
  });

  await t.test('uses LNET_BASE_URL without its trailing slash', async () => {
    process.env.LNET_BASE_URL = 'http://localhost:8794/';
    const requests = stubFetch(() => jsonResponse({}));
    await getNetwork('x.lnet');
    delete process.env.LNET_BASE_URL;
    assert.equal(String(requests[0].url), 'http://localhost:8794/api/library/network?id=x.lnet');
  });

  await t.test('sets a request timeout', async () => {
    const requests = stubFetch(() => jsonResponse({}));
    await getNetwork('x.lnet');
    assert.ok(requests[0].init.signal instanceof AbortSignal);
  });

  await t.test('maps API errors to status and code', async () => {
    stubFetch(() => jsonResponse({ error: 'not-found' }, 404));
    await assert.rejects(getNetwork('gone.lnet'), (error: unknown) => {
      assert.ok(error instanceof LibraryError);
      assert.equal(error.status, 404);
      assert.equal(error.code, 'not-found');
      return true;
    });
  });

  await t.test('marks non-JSON failures as unknown', async () => {
    stubFetch(() => new Response('Bad Gateway', { status: 502 }));
    await assert.rejects(getNetwork('x.lnet'), { status: 502, code: 'unknown' });
  });

  await t.test('rejects a non-JSON success body', async () => {
    stubFetch(() => new Response('<html></html>', { status: 200 }));
    await assert.rejects(searchNetworks({}), { status: 200, code: 'unknown' });
  });

  await t.test('marks network failures as unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(searchNetworks({}), { status: 0, code: 'unreachable' });
  });

  await t.test('reads the Retry-After wait on rate limits', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'rate-limited' }), {
      status: 429,
      headers: { 'Retry-After': '125' }
    }));
    await assert.rejects(searchNetworks({}), { status: 429, code: 'rate-limited', retryAfter: 125 });
  });

  await t.test('sends the last tag and returns nothing when unchanged', async () => {
    const requests = stubFetch(() => new Response(null, { status: 304 }));
    assert.equal(await searchIfChanged({ limit: 50 }, '"v1"'), undefined);
    assert.equal((requests[0].init.headers as Record<string, string>)['If-None-Match'], '"v1"');
  });

  await t.test('returns the page and its tag when changed', async () => {
    const requests = stubFetch(() => new Response(JSON.stringify({ total: 1, results: [network()] }), {
      headers: { ETag: '"v2"' }
    }));
    const changed = await searchIfChanged({ limit: 50 });
    assert.equal(changed?.etag, '"v2"');
    assert.equal(changed?.page.total, 1);
    assert.equal((requests[0].init.headers as Record<string, string>)['If-None-Match'], undefined);
  });

  await t.test('turns errors into user messages', () => {
    assert.equal(errorMessage(new LibraryError(404, 'not-found')), "That network isn't in the library any more.");
    assert.equal(errorMessage(new LibraryError(429, 'rate-limited')), 'The library is busy, try again in a minute.');
    assert.equal(errorMessage(new LibraryError(429, 'rate-limited', 1)), 'The library is busy, try again in 1 second.');
    assert.equal(errorMessage(new LibraryError(429, 'rate-limited', 45)), 'The library is busy, try again in 45 seconds.');
    assert.equal(errorMessage(new LibraryError(429, 'rate-limited', 60)), 'The library is busy, try again in a minute.');
    assert.equal(errorMessage(new LibraryError(429, 'rate-limited', 125)), 'The library is busy, try again in 3 minutes.');
    assert.equal(errorMessage(new LibraryError(400, 'bad-type')), "That resource type filter isn't valid.");
    assert.equal(errorMessage(new LibraryError(503, 'unknown')), "Couldn't reach the network library, try again later.");
    assert.equal(errorMessage(new LibraryError(0, 'unreachable')), "Couldn't reach the network library, try again later.");
  });
});
