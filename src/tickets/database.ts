import Database, { Database as DatabaseInstance } from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TicketInput, TicketRecord } from './types.js';

export function getTicketDb(customPath?: string): DatabaseInstance {
  const dbPath = customPath || process.env.TICKETS_DB_PATH || './data/tickets.db';
  if (dbPath !== ':memory:') {
    const resolved = resolve(process.cwd(), dbPath);
    const dir = dirname(resolved);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const db = new Database(resolved);
    initTicketDb(db);
    return db;
  }

  const db = new Database(':memory:');
  initTicketDb(db);
  return db;
}

export function initTicketDb(db: DatabaseInstance): void {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL COLLATE NOCASE,
      channel_id TEXT NOT NULL,
      user_id TEXT,
      client_name TEXT NOT NULL,
      contact_info TEXT NOT NULL,
      service_type TEXT NOT NULL,
      budget TEXT NOT NULL,
      description TEXT NOT NULL,
      links TEXT,
      status TEXT NOT NULL CHECK (status IN ('UNCLAIMED', 'ACTIVE', 'CLOSED')) DEFAULT 'UNCLAIMED',
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets(code);
    CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  `);
}

export function createTicketRecord(db: DatabaseInstance, input: TicketInput): TicketRecord {
  const now = Date.now();
  const normalizedCode = input.code.trim().toUpperCase();

  const stmt = db.prepare(`
    INSERT INTO tickets (
      code,
      channel_id,
      user_id,
      client_name,
      contact_info,
      service_type,
      budget,
      description,
      links,
      status,
      created_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'UNCLAIMED', ?)
  `);

  const result = stmt.run(
    normalizedCode,
    input.channelId,
    input.clientName,
    input.contactInfo,
    input.serviceType,
    input.budget,
    input.description,
    input.links || null,
    now
  );

  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(result.lastInsertRowid) as TicketRecord;
}

export function getTicketByCode(db: DatabaseInstance, code: string): TicketRecord | null {
  const normalized = code.trim();
  const stmt = db.prepare(`SELECT * FROM tickets WHERE code = ? COLLATE NOCASE`);
  const row = stmt.get(normalized);
  return (row as TicketRecord) || null;
}

export function getTicketByChannelId(db: DatabaseInstance, channelId: string): TicketRecord | null {
  const stmt = db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`);
  const row = stmt.get(channelId);
  return (row as TicketRecord) || null;
}

export function claimTicketRecord(
  db: DatabaseInstance,
  code: string,
  userId: string
): TicketRecord | null {
  const now = Date.now();
  const normalized = code.trim();

  const stmt = db.prepare(`
    UPDATE tickets
    SET status = 'ACTIVE', user_id = ?, claimed_at = ?
    WHERE code = ? COLLATE NOCASE AND status = 'UNCLAIMED'
  `);

  const result = stmt.run(userId, now, normalized);
  if (result.changes === 0) {
    return null;
  }

  return getTicketByCode(db, normalized);
}

export function closeTicketRecord(
  db: DatabaseInstance,
  channelIdOrCode: string
): TicketRecord | null {
  const now = Date.now();
  const identifier = channelIdOrCode.trim();

  const stmt = db.prepare(`
    UPDATE tickets
    SET status = 'CLOSED', closed_at = ?
    WHERE (channel_id = ? OR code = ? COLLATE NOCASE) AND status != 'CLOSED'
  `);

  const result = stmt.run(now, identifier, identifier);
  if (result.changes === 0) {
    return null;
  }

  const selectStmt = db.prepare(`
    SELECT * FROM tickets
    WHERE channel_id = ? OR code = ? COLLATE NOCASE
  `);
  return (selectStmt.get(identifier, identifier) as TicketRecord) || null;
}
