import { ButtonInteraction } from 'discord.js';
import { notice } from './cards.js';
import { cardOrMessage, detailFor, ephemeral, payload, sendPublic } from './replies.js';
import { resultsCard, viewRow } from './results.js';
import { getSearch, loadPage } from './searches.js';

const EXPIRED = 'This search has expired. Run `/network search` again.';
const NOT_YOURS = 'Only the person who ran this search can use these buttons.';
const MOVED = 'That result moved. Run `/network search` again.';

export async function handleNetworkButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, token, arg] = interaction.customId.split(':');
  const search = getSearch(token);
  if (!search || search.userId !== interaction.user.id) {
    await interaction.reply(ephemeral(notice(search ? NOT_YOURS : EXPIRED)));
    return;
  }
  if (action === 'back') {
    await interaction.update(payload(resultsCard(search, token)));
    return;
  }

  const value = Number(arg);
  const network = search.results[value];
  if (action !== 'page' && !network) {
    await interaction.reply(ephemeral(notice(MOVED)));
    return;
  }
  if (action === 'share') {
    await sendPublic(interaction, () => detailFor(network));
    return;
  }

  await interaction.deferUpdate();
  const result = await cardOrMessage(async () => {
    if (action !== 'page') return [...await detailFor(network), viewRow(token, value)];
    await loadPage(search, value);
    return resultsCard(search, token);
  });
  if (typeof result === 'string') {
    await interaction.followUp(ephemeral(notice(result)));
  } else {
    await interaction.editReply(payload(result));
  }
}
