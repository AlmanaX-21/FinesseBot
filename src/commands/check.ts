import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  GuildMember
} from 'discord.js';
import { RoleRule } from '../types.js';
import { MemberStore } from '../database.js';
import { evaluateMember } from '../evaluator.js';
import { syncMemberRoles } from '../assigner.js';

export const checkCommand = {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check your server stats, unlocked roles, and upcoming requirements')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member whose stats you want to view')
        .setRequired(false)
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    rules: RoleRule[],
    store: MemberStore
  ): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member || !member.joinedTimestamp) {
      await interaction.reply({ content: 'Could not fetch member details.', ephemeral: true });
      return;
    }

    const stats = store.getStats(interaction.guild.id, member.id);
    const evaluation = evaluateMember(
      member.id,
      interaction.guild.id,
      stats.messageCount,
      member.joinedTimestamp,
      rules
    );

    await syncMemberRoles(member, rules, stats.messageCount);

    const embed = new EmbedBuilder()
      .setTitle(`Stats & Role Progress: ${member.displayName}`)
      .setColor(0x5865f2)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Messages Sent', value: `${stats.messageCount}`, inline: true },
        { name: 'Days in Server', value: `${evaluation.daysInServer} days`, inline: true }
      );

    if (evaluation.eligibleRoles.length > 0) {
      const roleList = evaluation.eligibleRoles.map(r => `• **${r.name}**`).join('\n');
      embed.addFields({ name: 'Unlocked Roles', value: roleList, inline: false });
    } else {
      embed.addFields({ name: 'Unlocked Roles', value: 'None yet. Keep chatting and hanging out!', inline: false });
    }

    if (evaluation.nextRoles.length > 0) {
      const nextList = evaluation.nextRoles
        .map(nr => {
          const reqs: string[] = [];
          if (nr.missingMessages > 0) {
            reqs.push(`${nr.missingMessages} more messages`);
          }
          if (nr.missingDays > 0) {
            reqs.push(`${nr.missingDays} more days`);
          }
          return `• **${nr.rule.name}** — Needs ${reqs.join(' and ')}`;
        })
        .join('\n');
      embed.addFields({ name: 'Upcoming Roles', value: nextList, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  }
};
