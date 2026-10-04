import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import { issueLink } from '../issues/format.js';
import { IssueSync, SyncResult } from '../issues/types.js';

const STATUS_MESSAGES = {
  untracked: '⚠️ Run this inside a post in a tracked forum.',
  untagged: '⚠️ Add a mod tag to this post first.',
  busy: '⏳ Issue creation is already in progress for this post.'
};

function describeResult(result: SyncResult): string {
  if (result.status !== 'synced') {
    return STATUS_MESSAGES[result.status];
  }
  return [
    ...result.created.map(issue => `✅ Created ${issueLink(issue)}`),
    ...result.existing.map(issue => `🔗 Already tracked: ${issueLink(issue)}`),
    ...result.errors.map(error => `❌ ${error}`)
  ].join('\n');
}

export function createIssueCommand(syncForumPost: IssueSync | null) {
  return {
    data: new SlashCommandBuilder()
      .setName('issue')
      .setDescription('Create GitHub issues for this forum post from its mod tags')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      if (!syncForumPost) {
        await interaction.reply({ content: '❌ GitHub integration is not configured.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const thread = await interaction.client.channels.fetch(interaction.channelId);
      if (!thread?.isThread()) {
        await interaction.editReply({ content: STATUS_MESSAGES.untracked });
        return;
      }

      const result = await syncForumPost(thread);
      await interaction.editReply({ content: describeResult(result), flags: MessageFlags.SuppressEmbeds });
    }
  };
}
