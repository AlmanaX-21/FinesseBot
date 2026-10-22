import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder
} from 'discord.js';
import { Card, cut, plain, text } from './cards.js';
import { PAGE_SIZE, SavedSearch } from './searches.js';
import { Network } from './types.js';

const EMPTY_HINT = 'Try fewer words, or drop the type or author filter.';
const DESCRIPTION_LIMIT = 120;

function button(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary);
}

function filters(search: SavedSearch): string[] {
  return [
    search.type ? `type ${search.type}` : '',
    search.author ? `by ${plain(search.author)}` : ''
  ].filter(Boolean);
}

function quoted(search: SavedSearch): string {
  return search.query ? `“${plain(search.query)}”` : '';
}

function title(search: SavedSearch, page: number, pages: number): string {
  const noun = search.total === 1 ? 'network' : 'networks';
  const query = search.query ? ` for ${quoted(search)}` : '';
  return [`### ${search.total} ${noun}${query}`, ...filters(search), `page ${page}/${pages}`].join(' · ');
}

function resultSection(network: Network, token: string, index: number): SectionBuilder {
  const types = network.types.join(', ') || 'no resources';
  const lines = [`**${plain(network.name)}** · by ${plain(network.author)} · ${types}`];
  const description = network.description.replace(/\s+/gu, ' ').trim();
  if (description) lines.push(`-# ${plain(cut(description, DESCRIPTION_LIMIT))}`);
  return new SectionBuilder()
    .addTextDisplayComponents(text(lines.join('\n')))
    .setButtonAccessory(button(`net:view:${token}:${index}`, 'View'));
}

export function resultsCard(search: SavedSearch, token: string): Card {
  if (search.total === 0) {
    const heading = ['### No networks match', quoted(search), ...filters(search)].filter(Boolean).join(' · ');
    return [new ContainerBuilder().addTextDisplayComponents(text(`${heading}\n${EMPTY_HINT}`))];
  }

  const page = Math.floor(search.offset / PAGE_SIZE) + 1;
  const pages = Math.ceil(search.total / PAGE_SIZE);
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(text(title(search, page, pages)))
      .addSectionComponents(search.results.map((network, index) => resultSection(network, token, index)))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`net:page:${token}:${search.offset - PAGE_SIZE}`, '◀ Prev').setDisabled(page === 1),
        button(`net:noop:${token}`, `${page}/${pages}`).setDisabled(true),
        button(`net:page:${token}:${search.offset + PAGE_SIZE}`, 'Next ▶').setDisabled(page >= pages)
      ))
  ];
}

export function viewRow(token: string, index: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`net:back:${token}`, 'Back'),
    button(`net:share:${token}:${index}`, 'Share in channel').setStyle(ButtonStyle.Primary)
  );
}
