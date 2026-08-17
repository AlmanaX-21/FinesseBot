import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { PermissionFlagsBits, TextInputStyle, ComponentType } from 'discord.js';
import { initTicketDb, createTicketRecord, getTicketByCode } from '../../src/tickets/database.js';
import {
  buildClaimPanelEmbed,
  buildClaimPanelActionRow,
  buildClaimModal,
  handleClaimModalSubmit
} from '../../src/tickets/claim-handler.js';

test('Ticket Claim Interaction & Modal Verification', async (t) => {
  const db = new Database(':memory:');
  initTicketDb(db);

  await t.test('buildClaimPanelEmbed constructs informative embed', () => {
    const embed = buildClaimPanelEmbed();
    const json = embed.toJSON();
    assert.equal(json.title, '🔑 Claim Commission Ticket');
    assert.ok(json.description?.includes('Commission Code'));
  });

  await t.test('buildClaimPanelActionRow creates Claim Ticket button', () => {
    const row = buildClaimPanelActionRow();
    const json = row.toJSON();
    const btn = json.components[0];
    assert.equal(btn.custom_id, 'btn_claim_ticket');
  });

  await t.test('buildClaimModal creates modal with ticket_code input', () => {
    const modal = buildClaimModal();
    const json = modal.toJSON();
    assert.equal(json.custom_id, 'modal_claim_ticket');
    assert.equal(json.title, 'Claim Commission Ticket');
    const row = json.components[0];
    assert.equal(row.type, ComponentType.ActionRow);
    const input = row.components[0];
    assert.equal(input.custom_id, 'ticket_code');
    assert.equal(input.style, TextInputStyle.Short);
    assert.equal(input.required, true);
  });

  await t.test('handleClaimModalSubmit rejects invalid or non-existent code', async () => {
    let repliedContent = '';
    let isEphemeral = false;

    const mockInteraction = {
      user: { id: 'user-111' },
      guild: { id: 'guild-111', channels: { fetch: async () => null } },
      fields: { getTextInputValue: () => 'COM-INVALID-99' },
      reply: async (opts: any) => {
        repliedContent = opts.content;
        isEphemeral = opts.ephemeral;
      }
    } as any;

    await handleClaimModalSubmit(mockInteraction, db);
    assert.ok(repliedContent.includes('Invalid'));
    assert.equal(isEphemeral, true);
  });

  await t.test('handleClaimModalSubmit successfully claims ticket, updates permissions, and DB', async () => {
    createTicketRecord(db, {
      code: 'COM-CLAIM-01',
      channelId: 'chan-12345',
      clientName: 'Dave Client',
      contactInfo: 'dave@example.com',
      serviceType: 'Bot Hosting',
      budget: '$500',
      description: 'Test commission description'
    });

    let overwritesSet = false;
    let welcomeSent = false;
    let repliedContent = '';

    const mockChannel = {
      id: 'chan-12345',
      permissionOverwrites: {
        edit: async (userId: string, perms: any) => {
          if (userId === 'user-111' && perms.ViewChannel === true) {
            overwritesSet = true;
          }
        }
      },
      send: async (msg: any) => {
        if (msg.content.includes('user-111')) {
          welcomeSent = true;
        }
      }
    };

    const mockInteraction = {
      user: { id: 'user-111' },
      guild: {
        id: 'guild-111',
        channels: {
          fetch: async (id: string) => (id === 'chan-12345' ? mockChannel : null)
        }
      },
      fields: { getTextInputValue: () => 'com-claim-01' }, // Case-insensitive input
      reply: async (opts: any) => {
        repliedContent = opts.content;
      }
    } as any;

    await handleClaimModalSubmit(mockInteraction, db);

    assert.equal(overwritesSet, true);
    assert.equal(welcomeSent, true);
    assert.ok(repliedContent.includes('chan-12345'));

    const updated = getTicketByCode(db, 'COM-CLAIM-01');
    assert.equal(updated?.status, 'ACTIVE');
    assert.equal(updated?.user_id, 'user-111');
    assert.ok(updated?.claimed_at && updated.claimed_at > 0);
  });

  await t.test('handleClaimModalSubmit rejects already claimed ticket', async () => {
    let repliedContent = '';

    const mockInteraction = {
      user: { id: 'user-222' },
      guild: { id: 'guild-111', channels: { fetch: async () => null } },
      fields: { getTextInputValue: () => 'COM-CLAIM-01' },
      reply: async (opts: any) => {
        repliedContent = opts.content;
      }
    } as any;

    await handleClaimModalSubmit(mockInteraction, db);
    assert.ok(repliedContent.includes('Invalid') || repliedContent.includes('already claimed'));
  });
});
