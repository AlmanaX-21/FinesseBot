import test from 'node:test';
import assert from 'node:assert/strict';
import { tail, uploadLog } from '../../src/crashes/mclogs.js';
import { jsonResponse, stubFetch } from '../library/fixtures.js';

test('mclo.gs uploads', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('keeps short logs unchanged', () => {
    assert.equal(tail('a\nb\nc'), 'a\nb\nc');
  });

  await t.test('keeps the last 25000 lines', () => {
    const log = Array.from({ length: 30_000 }, (_, i) => `line ${i}`).join('\n');
    const lines = tail(log).split('\n');
    assert.equal(lines.length, 25_000);
    assert.equal(lines[0], 'line 5000');
    assert.equal(lines.at(-1), 'line 29999');
  });

  await t.test('cuts oversized logs to whole lines under 10 MiB', () => {
    const line = 'x'.repeat(1023);
    const log = Array.from({ length: 12_000 }, (_, i) => `${i}${line}`).join('\n');
    const kept = tail(log);
    assert.ok(Buffer.byteLength(kept) <= 10 * 1024 * 1024);
    assert.ok(kept.startsWith(String(12_000 - kept.split('\n').length)));
    assert.ok(kept.endsWith(`11999${line}`));
  });

  await t.test('posts the log and returns its link', async () => {
    const requests = stubFetch(() => jsonResponse({ success: true, id: 'abc', url: 'https://mclo.gs/abc' }));
    const url = await uploadLog('hello');
    assert.equal(url, 'https://mclo.gs/abc');
    assert.equal(String(requests[0].url), 'https://api.mclo.gs/1/log');
    assert.equal(requests[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), { content: 'hello', source: 'FinesseBot' });
  });

  await t.test('throws the API error on failure', async () => {
    stubFetch(() => jsonResponse({ success: false, error: 'Required field content is empty.' }, 400));
    await assert.rejects(uploadLog(''), /Required field content is empty/u);
  });

  await t.test('throws on a non-JSON reply', async () => {
    stubFetch(() => new Response('Bad Gateway', { status: 502 }));
    await assert.rejects(uploadLog('x'), /upload failed: 502/u);
  });
});
