import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel
} from 'discord.js';
import {
  buildClaimPanelActionRow,
  buildClaimPanelEmbed
} from '../tickets/claim-handler.js';

export const setupClaimCommand = {
  data: new SlashCommandBuilder()
    .setName('setup-claim')
    .setDescription('Deploy the commission ticket claim panel with button')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Target text channel for the claim panel (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used inside a Discord server.',
        ephemeral: true
      });
      return;
    }

    const targetChannel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;
    if (!targetChannel || !targetChannel.isTextBased()) {
      await interaction.reply({
        content: '❌ Please specify a valid text channel for the claim panel.',
        ephemeral: true
      });
      return;
    }

    const embed = buildClaimPanelEmbed();
    const row = buildClaimPanelActionRow();

    await targetChannel.send({
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: `✅ Claim panel posted to <#${targetChannel.id}>.`,
      ephemeral: true
    });
  }
};
