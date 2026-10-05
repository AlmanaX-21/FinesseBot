import { IssueDraft, LinkedIssue } from './types.js';

interface GitHubResponse {
  number: number;
  html_url: string;
  message?: string;
}

async function postToRepo(token: string, repo: string, path: string, payload: unknown): Promise<GitHubResponse> {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'FinesseBot'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000)
  }).catch((error: Error) => {
    const reason = error.cause instanceof Error ? error.cause.message : error.name;
    throw new Error(`GitHub request failed for ${repo}: ${reason}`);
  });
  const data = await response.json().catch(() => ({})) as GitHubResponse;

  if (!response.ok) {
    throw new Error(`GitHub ${response.status} for ${repo}: ${data.message || response.statusText}`);
  }
  return data;
}

export async function createIssue(
  token: string,
  repo: string,
  draft: IssueDraft
): Promise<LinkedIssue> {
  const data = await postToRepo(token, repo, 'issues', draft);
  return { repo, issue_number: data.number, issue_url: data.html_url };
}

export async function createComment(
  token: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  await postToRepo(token, repo, `issues/${issueNumber}/comments`, { body });
}
