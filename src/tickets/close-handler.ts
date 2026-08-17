import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle
} from 'discord.js';
import { Database as DatabaseInstance } from 'better-sqlite3';
import { closeTicketRecord, getTicketByChannelId } from './database.js';

export function buildCloseConfirmationRow(): ActionRowBuilder<ButtonBuilder> {
  const confirmBtn = new ButtonBuilder()
    .setCustomId('btn_confirm_close_ticket')
    .setLabel('Confirm Close Ticket')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('⚠️');

  const cancelBtn = new ButtonBuilder()
    .setCustomId('btn_cancel_close_ticket')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);
}

export async function handleCloseRequest(
  interaction: ButtonInteraction,
  db: DatabaseInstance
): Promise<void> {
  const ticket = getTicketByChannelId(db, interaction.channelId);

  if (!ticket || ticket.status === 'CLOSED') {
    await interaction.reply({
      content: '⚠️ This channel is not an active commission ticket.',
      ephemeral: true
    });
    return;
  }

  const row = buildCloseConfirmationRow();
  await interaction.reply({
    content: '⚠️ **Are you sure you want to close this commission ticket?**\n' +
      'This will mark the ticket as closed in the database and delete the channel.',
    components: [row],
    ephemeral: true
  });
}

export async function handleCloseCancel(interaction: ButtonInteraction): Promise<void> {
  if (interaction.update) {
    await interaction.update({
      content: 'Ticket closure cancelled.',
      components: []
    });
  } else if (interaction.reply) {
    await interaction.reply({
      content: 'Ticket closure cancelled.',
      ephemeral: true
    });
  }
}

export async function handleCloseConfirm(
  interaction: ButtonInteraction,
  db: DatabaseInstance,
  options?: { deletionDelayMs?: number }
): Promise<void> {
  const channelId = interaction.channelId;
  closeTicketRecord(db, channelId);

  const delayMs = options?.deletionDelayMs !== undefined ? options.deletionDelayMs : 5000;
  const msgContent = `🔒 **Ticket Closed.** This channel will be deleted in ${Math.round(delayMs / 1000)} seconds.`;

  if (interaction.deferred || interaction.replied) {
    if (interaction.editReply) {
      await interaction.editReply({ content: msgContent, components: [] });
    }
  } else if (interaction.update) {
    await interaction.update({ content: msgContent, components: [] });
  } else if (interaction.reply) {
    await interaction.reply({ content: msgContent, ephemeral: true });
  }

  const channel = interaction.channel || (interaction.guild ? await interaction.guild.channels.fetch(channelId).catch(() => null) : null);

  if (channel && 'delete' in channel) {
    if (delayMs <= 0) {
      await (channel as any).delete('Commission ticket closed and completed').catch(() => null);
    } else {
      setTimeout(async () => {
        try {
          await (channel as any).delete('Commission ticket closed and completed');
        } catch (err) {
          console.error('[Ticket Cleanup Error]:', err);
        }
      }, delayMs);
    }
  }
}
