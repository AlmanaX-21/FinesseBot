import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { AddressInfo } from 'node:net';
import { initTicketDb, getTicketByCode } from '../../src/tickets/database.js';
import { createApiServer } from '../../src/tickets/api-server.js';
import { CommissionPayload } from '../../src/tickets/types.js';

test('Embedded HTTP REST API Server', async (t) => {
  const db = new Database(':memory:');
  initTicketDb(db);

  const mockGuild = {
    id: 'mock-guild-id',
    client: { user: { id: 'mock-bot-id' } }
  };

  let mockChannelCreated = false;
  const mockChannelFactory = async (_guild: any, payload: CommissionPayload) => {
    mockChannelCreated = true;
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

  await t.test('POST /api/ticket/create rejects unauthorized requests', async () => {
    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'COM-TEST-01' })
    });
    assert.equal(res.status, 401);
  });

  await t.test('POST /api/ticket/create rejects invalid payload', async () => {
    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({ code: 'COM-TEST-01' }) // Missing required fields
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  await t.test('POST /api/ticket/create successfully provisions channel and saves record', async () => {
    const payload: CommissionPayload = {
      code: 'COM-API-01',
      clientName: 'Charlie Root',
      contactInfo: 'charlie@root.net',
      serviceType: 'DevOps & Bot Infrastructure',
      budget: '$2,000',
      description: 'Host and manage discord bot on Kinetic Hosting',
      links: ['https://kinetic.example']
    };

    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.code, 'COM-API-01');
    assert.equal(body.channelId, 'chan-com-api-01');

    const dbRecord = getTicketByCode(db, 'COM-API-01');
    assert.ok(dbRecord);
    assert.equal(dbRecord?.client_name, 'Charlie Root');
    assert.equal(dbRecord?.status, 'UNCLAIMED');
  });

  await t.test('POST /api/ticket/create rejects duplicate ticket code with 409', async () => {
    const payload: CommissionPayload = {
      code: 'COM-API-01',
      clientName: 'Charlie Root',
      contactInfo: 'charlie@root.net',
      serviceType: 'DevOps & Bot Infrastructure',
      budget: '$2,000',
      description: 'Host and manage discord bot on Kinetic Hosting'
    };

    const res = await fetch(`${baseUrl}/api/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(body.error.includes('already exists'));
  });
});
