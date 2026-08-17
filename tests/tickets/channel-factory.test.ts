import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, ButtonStyle, ComponentType } from 'discord.js';
import {
  buildTicketEmbed,
  buildTicketActionRow,
  buildChannelPermissions,
  formatChannelName
} from '../../src/tickets/channel-factory.js';
import { CommissionPayload } from '../../src/tickets/types.js';

test('Discord Channel Factory & UI Components', async (t) => {
  const samplePayload: CommissionPayload = {
    code: 'COM-TEST-99',
    clientName: 'Bob Builder',
    contactInfo: 'bob@builder.com',
    serviceType: 'Frontend Architecture',
    budget: '$1,500',
    description: 'Design and build interactive dashboard',
    links: ['https://figma.com/example', 'https://github.com/example']
  };

  await t.test('formatChannelName formats ticket channel name correctly', () => {
    assert.equal(formatChannelName('COM-TEST-99'), 'ticket-com-test-99');
    assert.equal(formatChannelName('COM_ABC_12'), 'ticket-com-abc-12');
  });

  await t.test('buildTicketEmbed constructs rich commission embed with all fields', () => {
    const embed = buildTicketEmbed(samplePayload);
    const data = embed.toJSON();

    assert.equal(data.title, 'Commission Ticket: COM-TEST-99');
    assert.ok(data.fields && data.fields.length >= 6);

    const clientField = data.fields?.find(f => f.name.includes('Client'));
    assert.equal(clientField?.value, 'Bob Builder');

    const serviceField = data.fields?.find(f => f.name.includes('Service'));
    assert.equal(serviceField?.value, 'Frontend Architecture');

    const budgetField = data.fields?.find(f => f.name.includes('Budget'));
    assert.equal(budgetField?.value, '$1,500');

    const statusField = data.fields?.find(f => f.name.includes('Status'));
    assert.ok(statusField?.value.includes('UNCLAIMED'));
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

  await t.test('buildChannelPermissions handles missing staff role gracefully', () => {
    const overwrites = buildChannelPermissions('guild-123', 'bot-456', undefined);
    assert.equal(overwrites.length, 2);
  });
});
