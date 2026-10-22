import { MessageFlags, RepliableInteraction } from 'discord.js';
import { LibraryError, errorMessage, getNetwork } from './api.js';
import { Card, detailCard, fallbackCard, notice } from './cards.js';
import { Network } from './types.js';

const NO_MENTIONS = { parse: [] };
const FAILED = 'Something went wrong, try again later.';

export function payload(components: Card) {
  return { components, flags: MessageFlags.IsComponentsV2 as const, allowedMentions: NO_MENTIONS };
}

export function ephemeral(components: Card) {
  return { ...payload(components), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

export async function cardOrMessage(build: () => Promise<Card | string>): Promise<Card | string> {
  try {
    return await build();
  } catch (error) {
    if (!(error instanceof LibraryError)) throw error;
    console.warn('[Library Error]:', error.status, error.code);
    return errorMessage(error);
  }
}

export async function detailFor(network: Network): Promise<Card> {
  try {
    return detailCard(await getNetwork(network.id));
  } catch (error) {
    if (!(error instanceof LibraryError) || error.status !== 422) throw error;
    console.warn('[Library Error]:', error.status, error.code);
    return fallbackCard(network);
  }
}

async function replyPrivately(interaction: RepliableInteraction, message: string): Promise<void> {
  await interaction.deleteReply();
  await interaction.followUp(ephemeral(notice(message)));
}

export async function sendPublic(
  interaction: RepliableInteraction,
  build: () => Promise<Card | string>
): Promise<void> {
  await interaction.deferReply();
  try {
    const result = await cardOrMessage(build);
    if (typeof result === 'string') {
      await replyPrivately(interaction, result);
      return;
    }
    await interaction.editReply(payload(result));
  } catch (error) {
    console.error('[Network Error]:', error);
    await replyPrivately(interaction, FAILED);
  }
}
