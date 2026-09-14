import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from 'discord.js';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is responding'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({ content: 'Pong!' });
  }
};
