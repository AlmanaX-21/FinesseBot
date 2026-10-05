import test from 'node:test';
import assert from 'node:assert/strict';
import { createComment, createIssue } from '../../src/issues/github.js';
import { IssueDraft } from '../../src/issues/types.js';

const draft: IssueDraft = { title: 'Crash on load', body: 'Stack trace', labels: ['bug'] };
const repo = 'AlmanaX-21/LogisticsNetworks';

function stubFetch(response: () => Response) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
  return requests;
}

test('GitHub issue client', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('posts the draft to the repo issues endpoint', async () => {
    const requests = stubFetch(() => new Response(
      JSON.stringify({ number: 42, html_url: 'https://github.com/AlmanaX-21/LogisticsNetworks/issues/42' }),
      { status: 201 }
    ));

    const issue = await createIssue('token-1', repo, draft);

    assert.deepEqual(issue, {
      repo,
      issue_number: 42,
      issue_url: 'https://github.com/AlmanaX-21/LogisticsNetworks/issues/42'
    });
    assert.equal(requests[0].url, 'https://api.github.com/repos/AlmanaX-21/LogisticsNetworks/issues');
    assert.equal(requests[0].init.method, 'POST');
    assert.ok(requests[0].init.signal instanceof AbortSignal);
    const headers = requests[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer token-1');
    assert.equal(headers.Accept, 'application/vnd.github+json');
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), draft);
  });

  await t.test('throws with status, repo and GitHub message', async () => {
    stubFetch(() => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }));

    await assert.rejects(
      createIssue('token-1', repo, draft),
      /GitHub 404 for AlmanaX-21\/LogisticsNetworks: Not Found/
    );
  });

  await t.test('falls back to status text for non-JSON errors', async () => {
    stubFetch(() => new Response('upstream down', { status: 502, statusText: 'Bad Gateway' }));

    await assert.rejects(createIssue('token-1', repo, draft), /GitHub 502 .*: Bad Gateway/);
  });

  await t.test('names the repo and cause when the request fails', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND api.github.com') });
    });

    await assert.rejects(
      createIssue('token-1', repo, draft),
      /GitHub request failed for AlmanaX-21\/LogisticsNetworks: getaddrinfo ENOTFOUND api\.github\.com/
    );
  });

  await t.test('posts a comment to the issue comments endpoint', async () => {
    const requests = stubFetch(() => new Response(JSON.stringify({ id: 7 }), { status: 201 }));

    await createComment('token-1', repo, 42, 'Thread replies');

    assert.equal(
      requests[0].url,
      'https://api.github.com/repos/AlmanaX-21/LogisticsNetworks/issues/42/comments'
    );
    const headers = requests[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer token-1');
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), { body: 'Thread replies' });
  });

  await t.test('throws with status and message when a comment fails', async () => {
    stubFetch(() => new Response(JSON.stringify({ message: 'Validation Failed' }), { status: 422 }));

    await assert.rejects(
      createComment('token-1', repo, 42, 'Thread replies'),
      /GitHub 422 for AlmanaX-21\/LogisticsNetworks: Validation Failed/
    );
  });
});
