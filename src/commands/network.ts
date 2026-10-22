import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandStringOption
} from 'discord.js';
import { searchNetworks } from '../library/api.js';
import { findNetwork, suggestNetworks } from '../library/catalog.js';
import { linkCard, notice, plain } from '../library/cards.js';
import { cardOrMessage, detailFor, payload, sendPublic } from '../library/replies.js';
import { resultsCard } from '../library/results.js';
import { SavedSearch, loadPage, saveSearch } from '../library/searches.js';
import { Network, RESOURCE_TYPES, ResourceType } from '../library/types.js';

const NO_MATCH = 'No networks to pick from.';

const typeOption = (option: SlashCommandStringOption) => option
  .setName('type')
  .setDescription('Resource the network moves')
  .addChoices(...RESOURCE_TYPES.map(type => ({ name: type[0] + type.slice(1).toLowerCase(), value: type })));

const networkOption = (option: SlashCommandStringOption) => option
  .setName('network')
  .setDescription('Network name')
  .setRequired(true)
  .setMaxLength(100)
  .setAutocomplete(true);

function typeFilter(interaction: ChatInputCommandInteraction): ResourceType | undefined {
  return (interaction.options.getString('type') ?? undefined) as ResourceType | undefined;
}

async function resolveNetwork(input: string): Promise<Network | string> {
  const value = input.trim();
  const known = findNetwork(value);
  if (known) return known;
  const { results } = await searchNetworks({ q: value, limit: 1 });
  return results[0] ?? `No network matches “${plain(value)}”.`;
}

async function search(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const saved: SavedSearch = {
    userId: interaction.user.id,
    query: interaction.options.getString('query')?.trim() || undefined,
    type: typeFilter(interaction),
    author: interaction.options.getString('author')?.trim() || undefined,
    offset: 0,
    total: 0,
    results: []
  };
  const result = await cardOrMessage(async () => {
    await loadPage(saved, 0);
    return resultsCard(saved, saveSearch(saved));
  });
  await interaction.editReply(payload(typeof result === 'string' ? notice(result) : result));
}

async function show(interaction: ChatInputCommandInteraction): Promise<void> {
  await sendPublic(interaction, async () => {
    const network = await resolveNetwork(interaction.options.getString('network', true));
    return typeof network === 'string' ? network : detailFor(network);
  });
}

async function link(interaction: ChatInputCommandInteraction): Promise<void> {
  await sendPublic(interaction, async () => {
    const network = await resolveNetwork(interaction.options.getString('network', true));
    return typeof network === 'string' ? network : linkCard(network);
  });
}

async function random(interaction: ChatInputCommandInteraction): Promise<void> {
  const type = typeFilter(interaction);
  await sendPublic(interaction, async () => {
    const { total } = await searchNetworks({ type, limit: 0 });
    if (total === 0) return NO_MATCH;
    const { results } = await searchNetworks({ type, limit: 1, offset: Math.floor(Math.random() * total) });
    return results[0] ? detailFor(results[0]) : NO_MATCH;
  });
}

const subcommands = { search, show, link, random };

export const networkCommand = {
  data: new SlashCommandBuilder()
    .setName('network')
    .setDescription('Look up networks in the Logistics Network library')
    .addSubcommand(sub => sub
      .setName('search')
      .setDescription('Search the library')
      .addStringOption(option => option
        .setName('query')
        .setDescription('Words in the name, author or description')
        .setMaxLength(100))
      .addStringOption(typeOption)
      .addStringOption(option => option.setName('author').setDescription('Exact author name').setMaxLength(100)))
    .addSubcommand(sub => sub.setName('show').setDescription('Show a network card').addStringOption(networkOption))
    .addSubcommand(sub => sub
      .setName('link')
      .setDescription('Get the permanent links to a network')
      .addStringOption(networkOption))
    .addSubcommand(sub => sub.setName('random').setDescription('Show a random network').addStringOption(typeOption)),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getSubcommand() as keyof typeof subcommands;
    await subcommands[name](interaction);
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    await interaction.respond(suggestNetworks(interaction.options.getFocused()));
  }
};
