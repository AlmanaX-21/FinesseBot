import Database from 'better-sqlite3';
import { AnyThreadChannel, ChannelType, Collection } from 'discord.js';
import { initIssueDb } from '../../src/issues/database.js';
import { createIssueSync } from '../../src/issues/handler.js';
import { IssueForum } from '../../src/types.js';

const forum: IssueForum = {
  channelId: 'forum-1',
  repos: {
    LogisticsNetworks: 'AlmanaX-21/LogisticsNetworks',
    OtherMod: 'AlmanaX-21/OtherMod'
  },
  labels: { feature: 'enhancement' }
};

const availableTags = [
  { id: 'tag-ln', name: 'LogisticsNetworks' },
  { id: 'tag-om', name: 'OtherMod' },
  { id: 'tag-feature', name: 'feature' }
];

export const starterMessage = {
  cleanContent: 'Straight lines please',
  member: { displayName: 'Blueye' },
  author: { displayName: 'blueye' },
  attachments: []
};

export function createReply(index: number, overrides: Record<string, unknown> = {}) {
  const createdTimestamp = Date.UTC(2026, 9, 4, 14, 0) + index * 60_000;
  return {
    id: `reply-${index}`,
    cleanContent: `reply ${index}`,
    createdTimestamp,
    createdAt: new Date(createdTimestamp),
    member: { displayName: `Member ${index}` },
    author: { displayName: `member${index}`, bot: false },
    system: false,
    attachments: [],
    ...overrides
  };
}

type Reply = ReturnType<typeof createReply>;

interface SentPayload {
  content: string;
  flags?: number;
  allowedMentions?: { parse: string[] };
}

interface ThreadFixtureOptions {
  appliedTags: string[];
  parentId?: string;
  parentType?: ChannelType;
  sendFails?: boolean;
  fetchStarterMessage?: () => Promise<unknown>;
  replies?: Reply[];
  repliesFail?: boolean;
}

export function createThreadFixture(options: ThreadFixtureOptions) {
  const sent: SentPayload[] = [];
  const replies = options.replies ?? [];
  const fetches: Array<{ after: string; limit: number }> = [];
  const thread = {
    id: 'thread-1',
    name: 'Option to switch straight line connection hints',
    url: 'https://discord.com/channels/guild-1/thread-1',
    parentId: options.parentId ?? 'forum-1',
    parent: { type: options.parentType ?? ChannelType.GuildForum, availableTags },
    appliedTags: options.appliedTags,
    fetchStarterMessage: options.fetchStarterMessage ?? (async () => starterMessage),
    messages: {
      // Mimics Discord: newest first
      fetch: async (query: { after: string; limit: number }) => {
        fetches.push(query);
        if (options.repliesFail) throw new Error('Missing Access');
        const start = replies.findIndex(reply => reply.id === query.after) + 1;
        const page = replies.slice(start, start + query.limit).reverse();
        return new Collection(page.map(reply => [reply.id, reply]));
      }
    },
    send: async (payload: SentPayload) => {
      if (options.sendFails) throw new Error('Missing Permissions');
      sent.push(payload);
    }
  } as unknown as AnyThreadChannel;
  return { thread, sent, fetches };
}

export function stubGitHub(failingRepos: string[] = [], failComments = false) {
  const requests: Array<{ url: string; body: { title: string; labels: string[]; body: string } }> = [];
  let nextNumber = 1;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    requests.push({ url: target, body: JSON.parse(String(init?.body)) });
    if (failingRepos.some(repo => target.includes(repo))) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }
    if (target.endsWith('/comments')) {
      return failComments
        ? new Response(JSON.stringify({ message: 'Validation Failed' }), { status: 422 })
        : new Response(JSON.stringify({ id: 1 }), { status: 201 });
    }
    const number = nextNumber++;
    const repo = target.replace('https://api.github.com/repos/', '').replace('/issues', '');
    return new Response(
      JSON.stringify({ number, html_url: `https://github.com/${repo}/issues/${number}` }),
      { status: 201 }
    );
  }) as typeof fetch;
  return requests;
}

export function createSync() {
  const db = new Database(':memory:');
  initIssueDb(db);
  const syncForumPost = createIssueSync({ db, token: 'token-1', forums: [forum], retryDelayMs: 0 });
  return { db, syncForumPost };
}
