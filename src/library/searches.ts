import { randomBytes } from 'node:crypto';
import { searchNetworks } from './api.js';
import { Network, ResourceType } from './types.js';

export const PAGE_SIZE = 5;
const TTL_MS = 15 * 60 * 1000;

export interface SavedSearch {
  userId: string;
  query?: string;
  type?: ResourceType;
  author?: string;
  offset: number;
  total: number;
  results: Network[];
}

const searches = new Map<string, { search: SavedSearch; expires: number }>();

export function saveSearch(search: SavedSearch): string {
  const now = Date.now();
  for (const [token, entry] of searches) {
    if (entry.expires <= now) searches.delete(token);
  }
  const token = randomBytes(6).toString('base64url');
  searches.set(token, { search, expires: now + TTL_MS });
  return token;
}

export function getSearch(token: string): SavedSearch | undefined {
  const entry = searches.get(token);
  return entry && entry.expires > Date.now() ? entry.search : undefined;
}

export async function loadPage(search: SavedSearch, offset: number): Promise<void> {
  const page = await searchNetworks({
    q: search.query,
    type: search.type,
    author: search.author,
    limit: PAGE_SIZE,
    offset
  });
  search.offset = offset;
  search.total = page.total;
  search.results = page.results;
}
