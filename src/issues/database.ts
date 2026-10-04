import { Database as DatabaseInstance } from 'better-sqlite3';
import { LinkedIssue } from './types.js';

export function initIssueDb(db: DatabaseInstance): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS forum_issues (
      thread_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      issue_number INTEGER NOT NULL,
      issue_url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (thread_id, repo)
    );
  `);
}

export function getLinkedIssues(db: DatabaseInstance, threadId: string): LinkedIssue[] {
  return db.prepare(`
    SELECT repo, issue_number, issue_url FROM forum_issues
    WHERE thread_id = ?
    ORDER BY created_at, rowid
  `).all(threadId) as LinkedIssue[];
}

export function saveLinkedIssue(db: DatabaseInstance, threadId: string, issue: LinkedIssue): void {
  db.prepare(`
    INSERT INTO forum_issues (thread_id, repo, issue_number, issue_url, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(threadId, issue.repo, issue.issue_number, issue.issue_url, Date.now());
}
