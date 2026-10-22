import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  escapeMarkdown
} from 'discord.js';
import { Network, NetworkDetails, ResourceType } from './types.js';

export type Card = Array<ContainerBuilder | TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>>;

const ACCENTS: Record<ResourceType, number> = {
  ITEM: 0xe5b567,
  FLUID: 0x81a1c1,
  ENERGY: 0xe8836b,
  CHEMICAL: 0x88c0a0,
  SOURCE: 0xc48b9f
};
const DEFAULT_ACCENT = 0x5fb3b3;
const LABELS_LIMIT = 300;
const PLAIN = { heading: true, bulletedList: true, numberedList: true, maskedLink: true };
const UNREADABLE = "-# This network is too large or can't be read, so there is no picture or stats.";

export function cut(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/u, '').trimEnd()}…` : value;
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function plain(value: string): string {
  return escapeMarkdown(value, PLAIN);
}

export function accentFor(network: Network): number {
  return ACCENTS[network.types[0]] ?? DEFAULT_ACCENT;
}

function linkRow(network: Network): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open in visualiser').setURL(network.links.visualiser),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download .lnet').setURL(network.links.file)
  );
}

function summary(network: Network): ContainerBuilder {
  const types = network.types.join(', ') || 'no resources';
  const container = new ContainerBuilder()
    .setAccentColor(accentFor(network))
    .addTextDisplayComponents(text(
      `## ${plain(network.name)}\nby **${plain(network.author)}** · ${network.source} · ${types}`
    ));
  const description = network.description.trim();
  return description ? container.addTextDisplayComponents(text(plain(description))) : container;
}

function statsText(details: NetworkDetails): string {
  const { nodes, links, activeChannels } = details.stats;
  const line = `**${nodes}** nodes · **${links}** links · **${activeChannels}** channels`;
  const labels = details.nodes.map(node => node.label.trim()).filter(Boolean).join(', ');
  return labels ? `${line}\n${plain(cut(labels, LABELS_LIMIT))}` : line;
}

export function detailCard(details: NetworkDetails): Card {
  return [
    summary(details)
      .addMediaGalleryComponents(gallery => gallery.addItems(item => item
        .setURL(details.links.image)
        .setDescription(`${details.name} network graph`)))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(text(statsText(details)))
      .addActionRowComponents(linkRow(details))
  ];
}

export function fallbackCard(network: Network): Card {
  return [summary(network).addTextDisplayComponents(text(UNREADABLE)).addActionRowComponents(linkRow(network))];
}

export function linkCard(network: Network): Card {
  return [
    new ContainerBuilder()
      .setAccentColor(accentFor(network))
      .addTextDisplayComponents(text(
        `**${plain(network.name)}** by ${plain(network.author)}\n${network.links.visualiser}`
      ))
      .addActionRowComponents(linkRow(network))
  ];
}

export function notice(message: string): Card {
  return [text(message)];
}
