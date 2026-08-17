import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import { BotConfig, RoleRule } from '../types.js';
import { MemberStore } from '../database.js';
import { addOrUpdateRoleRule, removeRoleRule } from '../config.js';

export const finesseCommand = {
  data: new SlashCommandBuilder()
    .setName('finesse')
    .setDescription('Manage automated role assignment configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName('role-add')
        .setDescription('Add or update an automated role rule in config')
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('The role to automate')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('message_count')
            .setDescription('Minimum messages required for this role')
            .setMinValue(1)
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('days_in_server')
            .setDescription('Minimum days in server required for this role')
            .setMinValue(1)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('role-remove')
        .setDescription('Remove an automated role rule from config')
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('The role to remove from automated rules')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all configured automated role rules')
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    activeConfig: BotConfig,
    store: MemberStore
  ): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'role-add') {
      const role = interaction.options.getRole('role', true);
      const messageCount = interaction.options.getInteger('message_count');
      const daysInServer = interaction.options.getInteger('days_in_server');

      if (!messageCount && !daysInServer) {
        await interaction.reply({
          content: 'You must specify at least one threshold (`message_count` or `days_in_server`).',
          ephemeral: true
        });
        return;
      }

      const newRule: RoleRule = {
        name: role.name,
        roleId: role.id,
        messageCount: messageCount || null,
        timeInServerDays: daysInServer || null
      };

      const updated = addOrUpdateRoleRule(newRule);
      activeConfig.roles = updated.roles;

      const embed = new EmbedBuilder()
        .setTitle('Role Rule Configured')
        .setColor(0x57f287)
        .setDescription(`Successfully updated configuration for **${role.name}**.`)
        .addFields(
          { name: 'Role ID', value: `\`${role.id}\``, inline: true },
          { name: 'Message Requirement', value: messageCount ? `${messageCount} messages` : 'None', inline: true },
          { name: 'Tenure Requirement', value: daysInServer ? `${daysInServer} days` : 'None', inline: true }
        )
        .setFooter({ text: 'Roles are checked automatically in the background cycle.' });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'role-remove') {
      const role = interaction.options.getRole('role', true);
      const { updatedConfig, removedRule } = removeRoleRule(role.id);
      activeConfig.roles = updatedConfig.roles;

      if (!removedRule) {
        await interaction.reply({
          content: `No active automated rule was configured for **${role.name}** (\`${role.id}\`).`,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: `Removed **${removedRule.name}** from automated role rules in \`config.json\`.`
      });
      return;
    }

    if (subcommand === 'list') {
      const embed = new EmbedBuilder()
        .setTitle('Configured Automated Roles')
        .setColor(0x5865f2)
        .setDescription(
          activeConfig.roles.length === 0
            ? 'No automated roles configured yet. Use `/finesse role-add` to add one.'
            : activeConfig.roles
                .map((r, i) => {
                  const reqs: string[] = [];
                  if (r.messageCount) reqs.push(`Messages: **${r.messageCount}**`);
                  if (r.timeInServerDays) reqs.push(`Tenure: **${r.timeInServerDays}d**`);
                  const idStr = r.roleId ? ` (\`${r.roleId}\`)` : '';
                  return `${i + 1}. **${r.name}**${idStr}\n   Requirements: ${reqs.join(' + ') || 'None'}`;
                })
                .join('\n\n')
        );

      await interaction.reply({ embeds: [embed] });
    }
  }
};
