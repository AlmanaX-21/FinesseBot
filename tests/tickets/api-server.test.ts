import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { initTicketDb, getTicketByCode } from '../../src/tickets/database.js';
import { createApiServer } from '../../src/tickets/api-server.js';
import { CommissionPayload } from '../../src/tickets/types.js';

function generateSignature(secret: string, timestamp: string, rawBody: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

test('Embedded HTTP REST API Server with HMAC Verification', async (t) => {
  const db = new Database(':memory:');
  initTicketDb(db);

  const mockGuild = {
    id: 'mock-guild-id',
    client: { user: { id: 'mock-bot-id' } }
  };

  const mockChannelFactory = async (_guild: any, payload: CommissionPayload) => {
    return {
      id: `chan-${payload.code.toLowerCase()}`,
      name: `ticket-${payload.code.toLowerCase()}`
    } as any;
  };

  const secret = 'super-secret-key-123';
  const server = createApiServer({
    db,
    guildResolver: () => mockGuild as any,
    channelFactory: mockChannelFactory,
    botApiSecret: secret
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  await t.test('GET /health returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  await t.test('POST /api/ticket/create rejects requests missing authorization header', async () => {
    const rawBody = JSON.stringify({ code: 'COM-TEST-01' });
    const timestamp = Date.now().toString();
    const sig = generateSignature(secret, timestamp, rawBody);

    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-timestamp': timestamp,
        'x-signature': sig
      },
      body: rawBody
    });
    assert.equal(res.status, 401);
  });

  await t.test('POST /api/ticket/create rejects requests with expired timestamp', async () => {
    const payload = {
      code: 'COM-EXP-01',
      clientName: 'Test',
      contactInfo: 'test@example.com',
      serviceType: 'Test',
      budget: '$100',
      description: 'Test brief'
    };
    const rawBody = JSON.stringify(payload);
    const expiredTimestamp = (Date.now() - 70000).toString();
    const sig = generateSignature(secret, expiredTimestamp, rawBody);

    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-timestamp': expiredTimestamp,
        'x-signature': sig
      },
      body: rawBody
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('timestamp') || body.error.includes('expired'));
  });

  await t.test('POST /api/ticket/create rejects requests with invalid HMAC signature', async () => {
    const payload = {
      code: 'COM-SIG-01',
      clientName: 'Test',
      contactInfo: 'test@example.com',
      serviceType: 'Test',
      budget: '$100',
      description: 'Test brief'
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = Date.now().toString();

    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-timestamp': timestamp,
        'x-signature': 'deadbeef0123456789abcdef'
      },
      body: rawBody
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('signature') || body.error.includes('Unauthorized'));
  });

  await t.test('POST /api/ticket/create successfully verifies HMAC and returns 200 OK', async () => {
    const payload: CommissionPayload = {
      code: 'COM-7842-X9',
      clientName: 'Alex Vance',
      contactInfo: 'alex@example.com',
      serviceType: 'Commission Enquiry',
      budget: '$100 - $250',
      description: 'Project brief and requirements...',
      links: ''
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = generateSignature(secret, timestamp, rawBody);

    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-timestamp': timestamp,
        'x-signature': signature
      },
      body: rawBody
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.code, 'COM-7842-X9');
    assert.equal(body.channelId, 'chan-com-7842-x9');

    const dbRecord = getTicketByCode(db, 'COM-7842-X9');
    assert.ok(dbRecord);
    assert.equal(dbRecord?.client_name, 'Alex Vance');
    assert.equal(dbRecord?.status, 'UNCLAIMED');
  });
});
