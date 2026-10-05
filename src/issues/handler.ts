import { setTimeout as sleep } from 'node:timers/promises';
import { AnyThreadChannel, ChannelType, ForumChannel, Message, MessageFlags } from 'discord.js';
import { Database as DatabaseInstance } from 'better-sqlite3';
import { IssueForum } from '../types.js';
import { getLinkedIssues, saveLinkedIssue } from './database.js';
import { buildConversationComments, buildIssueDraft, issueLink, reposForTags } from './format.js';
import { createComment, createIssue } from './github.js';
import { ForumPost, IssueDraft, IssueSync, LinkedIssue, SyncResult, ThreadReply } from './types.js';

interface IssueSyncOptions {
  db: DatabaseInstance;
  token: string;
  forums: IssueForum[];
  retryDelayMs?: number;
}

export function tagsChanged(before: AnyThreadChannel, after: AnyThreadChannel): boolean {
  return before.appliedTags.length !== after.appliedTags.length
    || before.appliedTags.some(id => !after.appliedTags.includes(id));
}

function appliedTagNames(thread: AnyThreadChannel, parent: ForumChannel): string[] {
  return parent.availableTags
    .filter(tag => thread.appliedTags.includes(tag.id))
    .map(tag => tag.name);
}

async function fetchStarterMessage(
  thread: AnyThreadChannel,
  retryDelayMs: number
): Promise<Message<true>> {
  let lastError: unknown;
  // Starter may lag thread creation
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs);
    const message = await thread.fetchStarterMessage().catch(error => {
      lastError = error;
      return null;
    });
    if (message) return message;
  }
  throw new Error('Starter message unavailable for this post.', { cause: lastError });
}

function authorName(message: Message<true>): string {
  return message.member?.displayName ?? message.author.displayName;
}

function attachmentsOf(message: Message<true>): ForumPost['attachments'] {
  return message.attachments.map(file => ({ name: file.name, url: file.url }));
}

function toForumPost(thread: AnyThreadChannel, message: Message<true>, tagNames: string[]): ForumPost {
  return {
    title: thread.name,
    url: thread.url,
    author: authorName(message),
    content: message.cleanContent,
    attachments: attachmentsOf(message),
    tagNames
  };
}

async function fetchReplies(thread: AnyThreadChannel): Promise<ThreadReply[]> {
  const messages: Message<true>[] = [];
  // Starter id equals thread id
  let after = thread.id;
  for (;;) {
    const page = await thread.messages.fetch({ after, limit: 100 });
    const batch = [...page.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    messages.push(...batch);
    if (page.size < 100) break;
    after = batch[batch.length - 1].id;
  }
  return messages
    .filter(message => !message.author.bot && !message.system)
    .map(message => ({
      author: authorName(message),
      content: message.cleanContent,
      attachments: attachmentsOf(message),
      createdAt: message.createdAt
    }));
}

async function postConversation(token: string, issue: LinkedIssue, comments: string[]): Promise<void> {
  for (const body of comments) {
    await createComment(token, issue.repo, issue.issue_number, body);
  }
}

async function createIssues(
  options: IssueSyncOptions,
  thread: AnyThreadChannel,
  repos: string[],
  draft: IssueDraft,
  comments: string[]
): Promise<{ created: LinkedIssue[]; errors: string[] }> {
  const created: LinkedIssue[] = [];
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const issue = await createIssue(options.token, repo, draft);
      saveLinkedIssue(options.db, thread.id, issue);
      created.push(issue);
      await postConversation(options.token, issue, comments).catch((error: Error) => {
        throw new Error(`Conversation comment failed: ${error.message}`);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[Issue Error]:', reason);
      errors.push(reason);
    }
  }

  if (created.length > 0) {
    await announceIssues(thread, created).catch(err => console.warn('[Issue Reply Error]:', err));
  }
  return { created, errors };
}

async function announceIssues(thread: AnyThreadChannel, issues: LinkedIssue[]): Promise<void> {
  await thread.send({
    content: issues.map(issue => `📌 Tracked on GitHub: ${issueLink(issue)}`).join('\n'),
    allowedMentions: { parse: [] },
    flags: MessageFlags.SuppressEmbeds
  });
}

export function createIssueSync(options: IssueSyncOptions): IssueSync {
  const inFlight = new Set<string>();
  const retryDelayMs = options.retryDelayMs ?? 1_000;

  return async function syncForumPost(thread: AnyThreadChannel): Promise<SyncResult> {
    const forum = options.forums.find(entry => entry.channelId === thread.parentId);
    const parent = thread.parent;
    if (!forum || parent?.type !== ChannelType.GuildForum) {
      return { status: 'untracked' };
    }

    const tagNames = appliedTagNames(thread, parent);
    const repos = reposForTags(forum, tagNames);
    if (repos.length === 0) {
      return { status: 'untagged' };
    }

    const existing = getLinkedIssues(options.db, thread.id);
    const missing = repos.filter(repo => !existing.some(issue => issue.repo === repo));
    const pending = missing.filter(repo => !inFlight.has(`${thread.id}:${repo}`));
    if (pending.length === 0) {
      return missing.length > 0
        ? { status: 'busy' }
        : { status: 'synced', created: [], existing, errors: [] };
    }

    const keys = pending.map(repo => `${thread.id}:${repo}`);
    keys.forEach(key => inFlight.add(key));
    try {
      const message = await fetchStarterMessage(thread, retryDelayMs);
      const draft = buildIssueDraft(forum, toForumPost(thread, message, tagNames));
      const comments = await fetchReplies(thread).then(buildConversationComments).catch(error => {
        console.error('[Issue Comment Error]:', error);
        return [];
      });
      const { created, errors } = await createIssues(options, thread, pending, draft, comments);
      return { status: 'synced', created, existing, errors };
    } finally {
      keys.forEach(key => inFlight.delete(key));
    }
  };
}
