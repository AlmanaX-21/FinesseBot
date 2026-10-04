import { IssueDraft, LinkedIssue } from './types.js';

interface GitHubIssueResponse {
  number: number;
  html_url: string;
  message?: string;
}

export async function createIssue(
  token: string,
  repo: string,
  draft: IssueDraft
): Promise<LinkedIssue> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'FinesseBot'
    },
    body: JSON.stringify(draft)
  });
  const data = await response.json().catch(() => ({})) as GitHubIssueResponse;

  if (!response.ok) {
    throw new Error(`GitHub ${response.status} for ${repo}: ${data.message || response.statusText}`);
  }

  return { repo, issue_number: data.number, issue_url: data.html_url };
}
