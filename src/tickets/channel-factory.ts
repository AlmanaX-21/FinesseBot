import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  OverwriteResolvable,
  PermissionFlagsBits,
  TextChannel
} from 'discord.js';
import { CommissionPayload } from './types.js';

export function sanitizeMentions(input: string): string {
  if (!input) {
    return '';
  }
  return input
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere');
}

export function formatChannelName(code: string): string {
  const sanitized = code.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  return `ticket-${sanitized}`;
}

export function buildTicketEmbed(payload: CommissionPayload): EmbedBuilder {
  const clientName = sanitizeMentions(payload.clientName);
  const contactInfo = sanitizeMentions(payload.contactInfo);
  const serviceType = sanitizeMentions(payload.serviceType);
  const budget = sanitizeMentions(payload.budget);
  const description = sanitizeMentions(payload.description || 'No description provided');

  let linksFormatted = 'None provided';
  if (Array.isArray(payload.links) && payload.links.length > 0) {
    linksFormatted = sanitizeMentions(payload.links.join('\n'));
  } else if (typeof payload.links === 'string' && payload.links.trim()) {
    linksFormatted = sanitizeMentions(payload.links);
  }

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`Commission Ticket: ${sanitizeMentions(payload.code)}`)
    .setDescription('A new commission request has been registered from the portfolio.')
    .addFields(
      { name: '👤 Client Name', value: clientName, inline: true },
      { name: '📬 Contact Info', value: contactInfo, inline: true },
      { name: '🛠️ Service Type', value: serviceType, inline: true },
      { name: '💰 Budget', value: budget, inline: true },
      { name: '🔒 Status', value: '`UNCLAIMED` (Awaiting client verification)', inline: true },
      { name: '📝 Description', value: description },
      { name: '🔗 Reference Links', value: linksFormatted }
    )
    .setTimestamp();
}

export function buildTicketActionRow(): ActionRowBuilder<ButtonBuilder> {
  const closeButton = new ButtonBuilder()
    .setCustomId('btn_close_ticket')
    .setLabel('Close Ticket')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);
}

export function buildChannelPermissions(
  guildId: string,
  botUserId: string,
  staffRoleId?: string
): OverwriteResolvable[] {
  const overwrites: OverwriteResolvable[] = [
    {
      id: guildId,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  if (staffRoleId && staffRoleId.trim().length > 0) {
    overwrites.push({
      id: staffRoleId.trim(),
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  return overwrites;
}

export async function createCommissionChannel(
  guild: Guild,
  payload: CommissionPayload,
  options?: { staffRoleId?: string; categoryId?: string }
): Promise<TextChannel> {
  const channelName = formatChannelName(payload.code);
  const botId = guild.client.user.id;
  const staffRoleId = options?.staffRoleId || process.env.DISCORD_STAFF_ROLE_ID || process.env.STAFF_ROLE_ID;
  const categoryId = options?.categoryId || process.env.DISCORD_CATEGORY_ID || process.env.COMMISSION_CATEGORY_ID;

  const permissionOverwrites = buildChannelPermissions(guild.id, botId, staffRoleId);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId && categoryId.trim().length > 0 ? categoryId.trim() : undefined,
    permissionOverwrites,
    topic: `Commission ${payload.code} | Client: ${payload.clientName} | Budget: ${payload.budget}`
  });

  const embed = buildTicketEmbed(payload);
  const row = buildTicketActionRow();

  const msg = await channel.send({
    embeds: [embed],
    components: [row]
  });

  await msg.pin().catch(() => null);

  return channel;
}
