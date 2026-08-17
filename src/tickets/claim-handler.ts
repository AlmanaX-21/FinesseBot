import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { Database as DatabaseInstance } from 'better-sqlite3';
import { claimTicketRecord, getTicketByCode } from './database.js';

export function buildClaimPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔑 Claim Commission Ticket')
    .setDescription(
      'Ready to discuss your project?\n\n' +
      'Click the button below and enter your **Commission Code** (e.g. `COM-XXXX-XX`) ' +
      'from your portfolio submission confirmation to unlock your private ticket channel.'
    )
    .setFooter({ text: 'Ensure your DMs and server notifications are enabled for updates.' });
}

export function buildClaimPanelActionRow(): ActionRowBuilder<ButtonBuilder> {
  const claimButton = new ButtonBuilder()
    .setCustomId('btn_claim_ticket')
    .setLabel('🔑 Claim Commission Ticket')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(claimButton);
}

export function buildClaimModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('modal_claim_ticket')
    .setTitle('Claim Commission Ticket');

  const codeInput = new TextInputBuilder()
    .setCustomId('ticket_code')
    .setLabel('Commission Code')
    .setPlaceholder('COM-XXXX-XX')
    .setStyle(TextInputStyle.Short)
    .setMinLength(6)
    .setMaxLength(30)
    .setRequired(true);

  const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(codeInput);
  modal.addComponents(row);

  return modal;
}

export async function handleClaimModalSubmit(
  interaction: ModalSubmitInteraction,
  db: DatabaseInstance
): Promise<void> {
  const rawCode = interaction.fields.getTextInputValue('ticket_code');
  const code = rawCode.trim().toUpperCase();

  const ticket = getTicketByCode(db, code);

  if (!ticket || ticket.status !== 'UNCLAIMED') {
    await interaction.reply({
      content: '❌ **Invalid Code:** This commission code does not exist or has already been claimed.',
      ephemeral: true
    });
    return;
  }

  const channel = await interaction.guild?.channels.fetch(ticket.channel_id).catch(() => null);
  if (!channel || !('permissionOverwrites' in channel)) {
    await interaction.reply({
      content: '❌ **Channel Error:** Could not locate the commission channel on this server. Please contact an administrator.',
      ephemeral: true
    });
    return;
  }

  try {
    await (channel as any).permissionOverwrites.edit(interaction.user.id, {
      [PermissionFlagsBits.ViewChannel.toString()]: true,
      [PermissionFlagsBits.SendMessages.toString()]: true,
      [PermissionFlagsBits.AttachFiles.toString()]: true,
      [PermissionFlagsBits.EmbedLinks.toString()]: true,
      [PermissionFlagsBits.ReadMessageHistory.toString()]: true,
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      EmbedLinks: true,
      ReadMessageHistory: true
    });

    const claimed = claimTicketRecord(db, code, interaction.user.id);
    if (!claimed) {
      await interaction.reply({
        content: '❌ **Race Condition:** This ticket was claimed by another session.',
        ephemeral: true
      });
      return;
    }

    if ('send' in channel) {
      await (channel as any).send({
        content: `👋 Welcome <@${interaction.user.id}>! You've successfully claimed this ticket. Staff will be with you shortly.`
      });
    }

    await interaction.reply({
      content: `✅ **Ticket Claimed Successfully!** Jump into your private channel here: <#${ticket.channel_id}>`,
      ephemeral: true
    });
  } catch (err) {
    console.error('[Claim Modal Error]:', err);
    await interaction.reply({
      content: '❌ **Error:** An unexpected error occurred while updating channel permissions.',
      ephemeral: true
    });
  }
}
