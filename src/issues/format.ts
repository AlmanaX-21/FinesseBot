import { IssueForum } from '../types.js';
import { ForumPost, IssueDraft, LinkedIssue } from './types.js';

const NO_DESCRIPTION = '_No description provided._';

function mapTags(mapping: Record<string, string>, tagNames: string[]): string[] {
  const lookup = new Map(
    Object.entries(mapping).map(([tag, value]) => [tag.toLowerCase(), value])
  );
  return [...new Set(tagNames.flatMap(name => lookup.get(name.toLowerCase()) ?? []))];
}

function escapeBrackets(text: string): string {
  return text.replace(/[[\]\\]/gu, '\\$&');
}

function neutralizeMentions(text: string): string {
  return text.replace(/@/gu, '@\u200B');
}

export function reposForTags(forum: IssueForum, tagNames: string[]): string[] {
  return mapTags(forum.repos, tagNames);
}

export function buildIssueDraft(forum: IssueForum, post: ForumPost): IssueDraft {
  const sections = [neutralizeMentions(post.content.trim()) || NO_DESCRIPTION];

  if (post.attachments.length > 0) {
    const links = post.attachments.map(file => `- [${escapeBrackets(file.name)}](${file.url})`);
    sections.push(`### Attachments\n${links.join('\n')}`);
  }

  sections.push(
    `---\nReported by **${neutralizeMentions(post.author)}** on Discord: ` +
    `[${escapeBrackets(post.title)}](${post.url})`
  );

  return {
    title: post.title,
    body: sections.join('\n\n'),
    labels: mapTags(forum.labels, post.tagNames)
  };
}

export function issueLink(issue: LinkedIssue): string {
  return `[${issue.repo}#${issue.issue_number}](${issue.issue_url})`;
}
