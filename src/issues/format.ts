import { IssueForum } from '../types.js';
import { ForumPost, IssueDraft, LinkedIssue, ThreadReply } from './types.js';

const NO_DESCRIPTION = '_No description provided._';
const COMMENT_LIMIT = 65_000;

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

function attachmentList(attachments: ForumPost['attachments']): string {
  return attachments.map(file => `- [${escapeBrackets(file.name)}](${file.url})`).join('\n');
}

export function reposForTags(forum: IssueForum, tagNames: string[]): string[] {
  return mapTags(forum.repos, tagNames);
}

export function buildIssueDraft(forum: IssueForum, post: ForumPost): IssueDraft {
  const sections = [neutralizeMentions(post.content.trim()) || NO_DESCRIPTION];

  if (post.attachments.length > 0) {
    sections.push(`### Attachments\n${attachmentList(post.attachments)}`);
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

function replyBlock(reply: ThreadReply): string {
  const stamp = reply.createdAt.toISOString().slice(0, 16).replace('T', ' ');
  const lines = [`**${neutralizeMentions(reply.author)}** · ${stamp} UTC`];
  const text = neutralizeMentions(reply.content.trim());
  if (text) lines.push(text);
  if (reply.attachments.length > 0) lines.push(attachmentList(reply.attachments));
  return lines.join('\n');
}

export function buildConversationComments(replies: ThreadReply[]): string[] {
  const blocks = replies
    .filter(reply => reply.content.trim() || reply.attachments.length > 0)
    .map(replyBlock);
  if (blocks.length === 0) return [];

  const comments = ['### Discord conversation'];
  for (const block of blocks) {
    const last = comments.length - 1;
    if (comments[last].length + block.length + 2 > COMMENT_LIMIT) {
      comments.push(block);
    } else {
      comments[last] += `\n\n${block}`;
    }
  }
  return comments;
}

export function issueLink(issue: LinkedIssue): string {
  return `[${issue.repo}#${issue.issue_number}](${issue.issue_url})`;
}
