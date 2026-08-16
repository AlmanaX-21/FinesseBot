import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import { RoleRule } from '../types.js';
import { MemberStore } from '../database.js';
import { syncGuildRoles } from '../assigner.js';

export const syncCommand = {
  data: new SlashCommandBuilder()
    .setName('syncroles')
    .setDescription('Scan all server members and assign eligible roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(
    interaction: ChatInputCommandInteraction,
    rules: RoleRule[],
    store: MemberStore
  ): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const { processed, rolesAssigned } = await syncGuildRoles(
        interaction.guild,
        rules,
        store
      );

      await interaction.editReply({
        content: `Audit complete. Processed ${processed} members and assigned ${rolesAssigned} new roles.`
      });
    } catch (error) {
      await interaction.editReply({
        content: `Failed to complete role sync: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }
};
