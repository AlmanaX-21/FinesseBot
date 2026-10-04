import { setTimeout as sleep } from 'node:timers/promises';
import { AnyThreadChannel, ChannelType, Message, MessageFlags } from 'discord.js';
import { Database as DatabaseInstance } from 'better-sqlite3';
import { IssueForum } from '../types.js';
import { getLinkedIssues, saveLinkedIssue } from './database.js';
import { buildIssueDraft, issueLink, reposForTags } from './format.js';
import { createIssue } from './github.js';
import { ForumPost, IssueDraft, IssueSync, LinkedIssue, SyncResult } from './types.js';

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

async function fetchStarterMessage(
  thread: AnyThreadChannel,
  retryDelayMs: number
): Promise<Message<true>> {
  // Starter may lag thread creation
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs);
    const message = await thread.fetchStarterMessage().catch(() => null);
    if (message) return message;
  }
  throw new Error('Starter message unavailable for this post.');
}

function toForumPost(thread: AnyThreadChannel, message: Message<true>, tagNames: string[]): ForumPost {
  return {
    title: thread.name,
    url: thread.url,
    author: message.member?.displayName ?? message.author.displayName,
    content: message.cleanContent,
    attachments: message.attachments.map(file => ({ name: file.name, url: file.url })),
    tagNames
  };
}

async function createIssues(
  options: IssueSyncOptions,
  threadId: string,
  repos: string[],
  draft: IssueDraft
): Promise<{ created: LinkedIssue[]; errors: string[] }> {
  const created: LinkedIssue[] = [];
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const issue = await createIssue(options.token, repo, draft);
      saveLinkedIssue(options.db, threadId, issue);
      created.push(issue);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[Issue Error]:', reason);
      errors.push(reason);
    }
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

    const tagNames = parent.availableTags
      .filter(tag => thread.appliedTags.includes(tag.id))
      .map(tag => tag.name);
    const repos = reposForTags(forum, tagNames);
    if (repos.length === 0) {
      return { status: 'untagged' };
    }

    const existing = getLinkedIssues(options.db, thread.id);
    const missing = repos.filter(repo => !existing.some(issue => issue.repo === repo));
    const keys = missing.map(repo => `${thread.id}:${repo}`);
    if (keys.some(key => inFlight.has(key))) {
      return { status: 'busy' };
    }
    if (missing.length === 0) {
      return { status: 'synced', created: [], existing, errors: [] };
    }

    keys.forEach(key => inFlight.add(key));
    try {
      const message = await fetchStarterMessage(thread, retryDelayMs);
      const draft = buildIssueDraft(forum, toForumPost(thread, message, tagNames));
      const { created, errors } = await createIssues(options, thread.id, missing, draft);
      if (created.length > 0) {
        await announceIssues(thread, created).catch(err => console.warn('[Issue Reply Error]:', err));
      }
      return { status: 'synced', created, existing, errors };
    } finally {
      keys.forEach(key => inFlight.delete(key));
    }
  };
}
