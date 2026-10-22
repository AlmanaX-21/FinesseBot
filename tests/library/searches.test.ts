import test from 'node:test';
import assert from 'node:assert/strict';
import { SavedSearch, getSearch, loadPage, saveSearch } from '../../src/library/searches.js';
import { jsonResponse, networks, stubFetch } from './fixtures.js';

const search = (): SavedSearch => ({ userId: 'user-1', query: 'bee', offset: 0, total: 0, results: [] });

test('saved searches', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('returns a saved search by its token', () => {
    const saved = search();
    const token = saveSearch(saved);
    assert.match(token, /^[\w-]{8}$/u);
    assert.equal(getSearch(token), saved);
    assert.equal(getSearch('missing'), undefined);
  });

  await t.test('expires searches after 15 minutes', (st) => {
    st.mock.timers.enable({ apis: ['Date'], now: 0 });
    const token = saveSearch(search());
    st.mock.timers.tick(15 * 60 * 1000 - 1);
    assert.ok(getSearch(token));
    st.mock.timers.tick(1);
    assert.equal(getSearch(token), undefined);
  });

  await t.test('loads a page with the saved filters', async () => {
    const requests = stubFetch(() => jsonResponse({ total: 12, results: networks(5) }));
    const saved = search();

    await loadPage(saved, 5);

    assert.equal(requests[0].url.search, '?q=bee&limit=5&offset=5');
    assert.equal(saved.offset, 5);
    assert.equal(saved.total, 12);
    assert.equal(saved.results.length, 5);
  });
});
