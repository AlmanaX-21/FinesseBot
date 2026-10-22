import test from 'node:test';
import assert from 'node:assert/strict';
import { findCrashReport, getSocket, pickCrashReport, readFile } from '../../src/crashes/panel.js';
import { collectLogs, crashEmbed } from '../../src/crashes/report.js';
import { jsonResponse, stubFetch } from '../library/fixtures.js';

const server = { url: 'https://panel.test', id: 'abcd1234', apiKey: 'key' };
const file = (name: string, modified: string, isFile = true) => ({ name, is_file: isFile, modified_at: modified });

test('Kinetic panel client', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('picks the newest crash report since the crash window', () => {
    const since = Date.parse('2026-10-23T12:00:00Z');
    const files = [
      file('crash-old-server.txt', '2026-10-23T11:00:00Z'),
      file('crash-a-server.txt', '2026-10-23T12:01:00Z'),
      file('crash-b-server.txt', '2026-10-23T12:02:00Z'),
      file('crash-c-server.txt', '2026-10-23T12:03:00Z', false),
      file('notes.md', '2026-10-23T12:04:00Z')
    ];
    assert.equal(pickCrashReport(files, since), '/crash-reports/crash-b-server.txt');
    assert.equal(pickCrashReport([files[0]], since), undefined);
  });

  await t.test('sends the API key to the server endpoint', async () => {
    const requests = stubFetch(() => jsonResponse({ data: { token: 'jwt', socket: 'wss://node.test/ws' } }));
    assert.deepEqual(await getSocket(server), { token: 'jwt', socket: 'wss://node.test/ws' });
    assert.equal(String(requests[0].url), 'https://panel.test/api/client/servers/abcd1234/websocket?');
    assert.equal((requests[0].init.headers as Record<string, string>).Authorization, 'Bearer key');
  });

  await t.test('lists the crash-reports folder', async () => {
    const requests = stubFetch(() => jsonResponse({
      data: [{ attributes: file('crash-a-server.txt', new Date().toISOString()) }]
    }));
    assert.equal(await findCrashReport(server, 0), '/crash-reports/crash-a-server.txt');
    assert.equal(requests[0].url.searchParams.get('directory'), '/crash-reports');
  });

  await t.test('reads a file through its signed download link', async () => {
    const requests = stubFetch(url => url.hostname === 'node.test'
      ? new Response('log text')
      : jsonResponse({ attributes: { url: 'https://node.test/download/file?token=x' } }));
    assert.equal(await readFile(server, '/logs/latest.log'), 'log text');
    assert.equal(requests[0].url.searchParams.get('file'), '/logs/latest.log');
    assert.equal(String(requests[1].url), 'https://node.test/download/file?token=x');
  });

  await t.test('rejects panel errors', async () => {
    stubFetch(() => jsonResponse({ errors: [] }, 401));
    await assert.rejects(getSocket(server), /Panel API 401/u);
  });

  await t.test('shares the latest log even when no crash report exists', async () => {
    stubFetch(url => {
      if (url.hostname === 'api.mclo.gs') return jsonResponse({ success: true, url: 'https://mclo.gs/log1' });
      if (url.hostname === 'node.test') return new Response('log text');
      if (url.pathname.endsWith('/files/list')) return jsonResponse({ errors: [] }, 404);
      return jsonResponse({ attributes: { url: 'https://node.test/download/file?token=x' } });
    });
    assert.deepEqual(await collectLogs(server, { at: Date.now() }), { log: 'https://mclo.gs/log1', report: undefined });
  });

  await t.test('builds the crash embed', () => {
    const embed = crashEmbed({ at: 0, exitCode: '1' }, { report: 'https://mclo.gs/r' }).toJSON();
    assert.deepEqual(embed.fields?.map(field => field.value), ['1', 'Unknown', 'https://mclo.gs/r', "Couldn't fetch"]);
  });
});
