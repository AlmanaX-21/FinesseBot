import { searchIfChanged, searchNetworks } from './api.js';
import { cut } from './cards.js';
import { Network } from './types.js';

const BATCH_SIZE = 50;
const REFRESH_MS = 5 * 60 * 1000;
const MAX_CHOICES = 25;

let networks: Network[] = [];
let etag: string | undefined;

export async function refreshCatalog(): Promise<void> {
  const first = await searchIfChanged({ limit: BATCH_SIZE, offset: 0 }, etag);
  if (!first) return;
  const loaded = [...first.page.results];
  while (loaded.length > 0 && loaded.length < first.page.total) {
    const page = await searchNetworks({ limit: BATCH_SIZE, offset: loaded.length });
    if (page.results.length === 0) break;
    loaded.push(...page.results);
  }
  networks = loaded;
  etag = first.etag;
}

export function startCatalog(): void {
  const refresh = () => refreshCatalog().catch((error: Error) => {
    console.warn('[Catalog Error]:', error.message);
  });
  void refresh();
  setInterval(refresh, REFRESH_MS);
}

export function findNetwork(value: string): Network | undefined {
  const name = value.toLowerCase();
  return networks.find(network => network.id === value || network.name.toLowerCase() === name);
}

export function suggestNetworks(input: string): Array<{ name: string; value: string }> {
  const terms = input.toLowerCase().split(/\s+/u).filter(Boolean);
  return networks
    .filter(network => {
      const haystack = `${network.name} ${network.author} ${network.id}`.toLowerCase();
      return terms.every(term => haystack.includes(term));
    })
    .slice(0, MAX_CHOICES)
    .map(network => ({ name: cut(network.name, 100), value: network.id }));
}
