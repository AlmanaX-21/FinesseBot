import { AnyThreadChannel } from 'discord.js';

export interface ForumPost {
  title: string;
  url: string;
  author: string;
  content: string;
  attachments: Array<{ name: string; url: string }>;
  tagNames: string[];
}

export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

export interface LinkedIssue {
  repo: string;
  issue_number: number;
  issue_url: string;
}

export type SyncResult =
  | { status: 'untracked' | 'untagged' | 'busy' }
  | { status: 'synced'; created: LinkedIssue[]; existing: LinkedIssue[]; errors: string[] };

export type IssueSync = (thread: AnyThreadChannel) => Promise<SyncResult>;
