import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { AddressInfo } from 'node:net';
import { initTicketDb, getTicketByCode, getTicketByChannelId } from '../../src/tickets/database.js';
import { createApiServer } from '../../src/tickets/api-server.js';
import { buildClaimModal, handleClaimModalSubmit } from '../../src/tickets/claim-handler.js';
import { handleCloseRequest, handleCloseConfirm } from '../../src/tickets/close-handler.js';
import { CommissionPayload } from '../../src/tickets/types.js';

test('Full Commission Lifecycle Integration Test', async (t) => {
  const db = new Database(':memory:');
  initTicketDb(db);

  let channelDeleted = false;
  let userOverwritesGiven = false;
  let welcomeMessageSent = false;

  const mockChannel = {
    id: 'chan-e2e-101',
    name: 'ticket-com-e2e-01',
    isTextBased: () => true,
    permissionOverwrites: {
      edit: async (userId: string, perms: any) => {
        if (userId === 'client-user-99' && perms.ViewChannel === true) {
          userOverwritesGiven = true;
        }
      }
    },
    send: async (msg: any) => {
      if (typeof msg.content === 'string' && msg.content.includes('client-user-99')) {
        welcomeMessageSent = true;
      }
    },
    delete: async () => {
      channelDeleted = true;
    }
  };

  const mockGuild = {
    id: 'guild-e2e',
    client: { user: { id: 'bot-app-id' } },
    channels: {
      fetch: async (id: string) => (id === 'chan-e2e-101' ? mockChannel : null)
    }
  };

  const secret = 'e2e-secret-key-xyz';
  const server = createApiServer({
    db,
    guildResolver: () => mockGuild as any,
    channelFactory: async () => mockChannel as any,
    botApiSecret: secret
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  const payload: CommissionPayload = {
    code: 'COM-E2E-01',
    clientName: 'Sarah Connor',
    contactInfo: 'sarah@resistance.org',
    serviceType: 'AI Defense Automation',
    budget: '$5,000',
    description: 'Autonomous mission execution platform',
    links: ['https://sky.net']
  };

  await t.test('Step 1: Portfolio website calls /api/ticket/create', async () => {
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
    assert.equal(body.code, 'COM-E2E-01');
    assert.equal(body.channelId, 'chan-e2e-101');

    const record = getTicketByCode(db, 'COM-E2E-01');
    assert.ok(record);
    assert.equal(record?.status, 'UNCLAIMED');
    assert.equal(record?.user_id, null);
  });

  await t.test('Step 2: Client joins server and claims ticket via modal', async () => {
    const modal = buildClaimModal();
    assert.equal(modal.data.custom_id, 'modal_claim_ticket');

    let replyMessage = '';
    const mockModalInteraction = {
      user: { id: 'client-user-99' },
      guild: mockGuild,
      fields: { getTextInputValue: () => 'com-e2e-01' },
      reply: async (opts: any) => {
        replyMessage = opts.content;
      }
    } as any;

    await handleClaimModalSubmit(mockModalInteraction, db);

    assert.ok(replyMessage.includes('chan-e2e-101'));
    assert.equal(userOverwritesGiven, true);
    assert.equal(welcomeMessageSent, true);

    const record = getTicketByCode(db, 'COM-E2E-01');
    assert.equal(record?.status, 'ACTIVE');
    assert.equal(record?.user_id, 'client-user-99');
    assert.ok(record?.claimed_at && record.claimed_at > 0);
  });

  await t.test('Step 3: Staff closes ticket, updating SQLite and deleting channel', async () => {
    let confirmPromptReply: any = null;
    const mockCloseBtnInteraction = {
      channelId: 'chan-e2e-101',
      reply: async (opts: any) => {
        confirmPromptReply = opts;
      }
    } as any;

    await handleCloseRequest(mockCloseBtnInteraction, db);
    assert.ok(confirmPromptReply);
    assert.ok(confirmPromptReply.components.length > 0);

    const mockConfirmBtnInteraction = {
      channelId: 'chan-e2e-101',
      channel: mockChannel,
      update: async () => {},
      reply: async () => {}
    } as any;

    await handleCloseConfirm(mockConfirmBtnInteraction, db, { deletionDelayMs: 0 });

    assert.equal(channelDeleted, true);

    const record = getTicketByChannelId(db, 'chan-e2e-101');
    assert.equal(record?.status, 'CLOSED');
    assert.ok(record?.closed_at && record.closed_at > 0);
  });
});
