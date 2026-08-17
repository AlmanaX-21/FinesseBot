import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, ButtonStyle, ComponentType } from 'discord.js';
import {
  buildTicketEmbed,
  buildTicketActionRow,
  buildChannelPermissions,
  formatChannelName,
  sanitizeMentions,
  createCommissionChannel
} from '../../src/tickets/channel-factory.js';
import { CommissionPayload } from '../../src/tickets/types.js';

test('Discord Channel Factory & UI Components', async (t) => {
  const samplePayload: CommissionPayload = {
    code: 'COM-TEST-99',
    clientName: 'Bob Builder',
    contactInfo: 'bob@builder.com',
    serviceType: 'Frontend Architecture',
    budget: '$1,500',
    description: 'Design and build interactive dashboard @everyone and @here',
    links: ['https://figma.com/example', 'https://github.com/example']
  };

  await t.test('formatChannelName formats ticket channel name correctly', () => {
    assert.equal(formatChannelName('COM-TEST-99'), 'ticket-com-test-99');
    assert.equal(formatChannelName('COM_ABC_12'), 'ticket-com-abc-12');
  });

  await t.test('sanitizeMentions removes @everyone and @here exploit attempts', () => {
    const raw = 'Hello @everyone and @here, check <@&123456>';
    const sanitized = sanitizeMentions(raw);
    assert.equal(sanitized.includes('@everyone'), false);
    assert.equal(sanitized.includes('@here'), false);
  });

  await t.test('buildTicketEmbed sanitizes content in all fields', () => {
    const embed = buildTicketEmbed(samplePayload);
    const data = embed.toJSON();

    assert.equal(data.title, 'Commission Ticket: COM-TEST-99');
    const descField = data.fields?.find(f => f.name.includes('Description'));
    assert.ok(descField);
    assert.equal(descField?.value.includes('@everyone'), false);
    assert.equal(descField?.value.includes('@here'), false);
  });

  await t.test('buildTicketActionRow creates Close Ticket danger button', () => {
    const row = buildTicketActionRow();
    const json = row.toJSON();

    assert.equal(json.type, ComponentType.ActionRow);
    const btn = json.components[0];
    assert.equal(btn.custom_id, 'btn_close_ticket');
    assert.equal(btn.style, ButtonStyle.Danger);
    assert.equal(btn.label, 'Close Ticket');
  });

  await t.test('buildChannelPermissions configures permissions for everyone, bot, and staff', () => {
    const overwrites = buildChannelPermissions('guild-123', 'bot-456', 'staff-789');
    assert.equal(overwrites.length, 3);

    const everyonePerm = overwrites.find(o => o.id === 'guild-123');
    assert.ok(everyonePerm);
    assert.deepEqual(everyonePerm?.deny, [PermissionFlagsBits.ViewChannel]);

    const staffPerm = overwrites.find(o => o.id === 'staff-789');
    assert.ok(staffPerm);
    assert.ok(staffPerm?.allow.includes(PermissionFlagsBits.ViewChannel));
    assert.ok(staffPerm?.allow.includes(PermissionFlagsBits.SendMessages));

    const botPerm = overwrites.find(o => o.id === 'bot-456');
    assert.ok(botPerm);
    assert.ok(botPerm?.allow.includes(PermissionFlagsBits.ManageChannels));
  });

  await t.test('createCommissionChannel pins the initial ticket embed', async () => {
    let pinned = false;
    let createdCategory = '';
    const mockMsg = {
      pin: async () => {
        pinned = true;
      }
    };
    const mockGuild = {
      id: 'g-123',
      client: { user: { id: 'bot-123' } },
      channels: {
        create: async (opts: any) => {
          createdCategory = opts.parent;
          return {
            id: 'c-123',
            name: opts.name,
            send: async () => mockMsg
          };
        }
      }
    };

    await createCommissionChannel(mockGuild as any, samplePayload, {
      categoryId: 'cat-999',
      staffRoleId: 'staff-999'
    });

    assert.equal(pinned, true);
    assert.equal(createdCategory, 'cat-999');
  });
});
