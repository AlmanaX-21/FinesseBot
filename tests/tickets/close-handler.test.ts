import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ButtonStyle } from 'discord.js';
import { initTicketDb, createTicketRecord, getTicketByCode } from '../../src/tickets/database.js';
import {
  buildCloseConfirmationRow,
  handleCloseRequest,
  handleCloseConfirm,
  handleCloseCancel
} from '../../src/tickets/close-handler.js';

test('Ticket Close & Housekeeping Handler', async (t) => {
  const db = new Database(':memory:');
  initTicketDb(db);

  await t.test('buildCloseConfirmationRow generates confirm and cancel buttons', () => {
    const row = buildCloseConfirmationRow();
    const json = row.toJSON();
    assert.equal(json.components.length, 2);
    assert.equal(json.components[0].custom_id, 'btn_confirm_close_ticket');
    assert.equal(json.components[0].style, ButtonStyle.Danger);
    assert.equal(json.components[1].custom_id, 'btn_cancel_close_ticket');
    assert.equal(json.components[1].style, ButtonStyle.Secondary);
  });

  await t.test('handleCloseRequest warns if channel is not a valid ticket', async () => {
    let repliedContent = '';
    const mockInteraction = {
      channelId: 'chan-invalid',
      reply: async (opts: any) => {
        repliedContent = opts.content;
      }
    } as any;

    await handleCloseRequest(mockInteraction, db);
    assert.ok(repliedContent.includes('not an active commission ticket'));
  });

  await t.test('handleCloseRequest presents confirmation prompt for active ticket', async () => {
    createTicketRecord(db, {
      code: 'COM-CLOSE-01',
      channelId: 'chan-close-1',
      clientName: 'Eve Client',
      contactInfo: 'eve@example.com',
      serviceType: 'Consulting',
      budget: '$800',
      description: 'Consulting brief'
    });

    let repliedComponents: any[] = [];
    const mockInteraction = {
      channelId: 'chan-close-1',
      reply: async (opts: any) => {
        repliedComponents = opts.components;
      }
    } as any;

    await handleCloseRequest(mockInteraction, db);
    assert.equal(repliedComponents.length, 1);
  });

  await t.test('handleCloseCancel updates interaction and dismisses prompt', async () => {
    let updateContent = '';
    const mockInteraction = {
      update: async (opts: any) => {
        updateContent = opts.content;
      }
    } as any;

    await handleCloseCancel(mockInteraction);
    assert.ok(updateContent.includes('cancelled'));
  });

  await t.test('handleCloseConfirm marks ticket CLOSED in DB and initiates channel deletion', async () => {
    let deletedCalled = false;
    let repliedContent = '';

    const mockChannel = {
      id: 'chan-close-1',
      delete: async () => {
        deletedCalled = true;
      }
    };

    const mockInteraction = {
      channelId: 'chan-close-1',
      channel: mockChannel,
      reply: async (opts: any) => {
        repliedContent = opts.content;
      },
      update: async (opts: any) => {
        repliedContent = opts.content;
      }
    } as any;

    await handleCloseConfirm(mockInteraction, db, { deletionDelayMs: 0 });

    const ticket = getTicketByCode(db, 'COM-CLOSE-01');
    assert.equal(ticket?.status, 'CLOSED');
    assert.ok(ticket?.closed_at && ticket.closed_at > 0);
    assert.ok(repliedContent.includes('Closed'));
    assert.equal(deletedCalled, true);
  });
});
