import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  initTicketDb,
  createTicketRecord,
  getTicketByCode,
  getTicketByChannelId,
  claimTicketRecord,
  closeTicketRecord
} from '../../src/tickets/database.js';
import { TicketInput } from '../../src/tickets/types.js';

test('Ticket Database Layer', async (t) => {
  const db = new Database(':memory:');
  initTicketDb(db);

  const sampleTicket: TicketInput = {
    code: 'COM-TEST-01',
    channelId: '123456789012345678',
    clientName: 'Alice Developer',
    contactInfo: 'alice@example.com',
    serviceType: 'Full-Stack Development',
    budget: '$500 - $1,000',
    description: 'Build a Discord portfolio integration bot',
    links: 'https://github.com/example, https://portfolio.example'
  };

  await t.test('createTicketRecord creates an UNCLAIMED ticket', () => {
    const created = createTicketRecord(db, sampleTicket);
    assert.equal(created.code, 'COM-TEST-01');
    assert.equal(created.status, 'UNCLAIMED');
    assert.equal(created.client_name, 'Alice Developer');
    assert.equal(created.channel_id, '123456789012345678');
    assert.equal(created.user_id, null);
    assert.ok(created.created_at > 0);
  });

  await t.test('createTicketRecord throws on duplicate code', () => {
    assert.throws(() => {
      createTicketRecord(db, sampleTicket);
    });
  });

  await t.test('getTicketByCode retrieves existing ticket case-insensitively', () => {
    const foundUpper = getTicketByCode(db, 'COM-TEST-01');
    const foundLower = getTicketByCode(db, 'com-test-01');
    assert.ok(foundUpper);
    assert.ok(foundLower);
    assert.equal(foundUpper?.id, foundLower?.id);
    assert.equal(foundUpper?.code, 'COM-TEST-01');

    const nonExistent = getTicketByCode(db, 'COM-NON-EXISTENT');
    assert.equal(nonExistent, null);
  });

  await t.test('getTicketByChannelId retrieves ticket by Discord channel ID', () => {
    const found = getTicketByChannelId(db, '123456789012345678');
    assert.ok(found);
    assert.equal(found?.code, 'COM-TEST-01');

    const notFound = getTicketByChannelId(db, '999999999999999999');
    assert.equal(notFound, null);
  });

  await t.test('claimTicketRecord transitions ticket to ACTIVE with userId', () => {
    const claimed = claimTicketRecord(db, 'COM-TEST-01', '987654321098765432');
    assert.ok(claimed);
    assert.equal(claimed?.status, 'ACTIVE');
    assert.equal(claimed?.user_id, '987654321098765432');
    assert.ok(claimed?.claimed_at && claimed.claimed_at > 0);

    const reClaim = claimTicketRecord(db, 'COM-TEST-01', 'another-user');
    assert.equal(reClaim, null);
  });

  await t.test('closeTicketRecord transitions ticket to CLOSED and sets closed_at', () => {
    const closed = closeTicketRecord(db, '123456789012345678');
    assert.ok(closed);
    assert.equal(closed?.status, 'CLOSED');
    assert.ok(closed?.closed_at && closed.closed_at > 0);

    const reClosed = closeTicketRecord(db, '123456789012345678');
    assert.equal(reClosed, null);
  });
});
