import { NetworkDetails, SearchPage, SearchQuery } from './types.js';

const DEFAULT_BASE_URL = 'https://logistics-network.almanax21.com';
const MESSAGES: Record<string, string> = {
  'not-found': "That network isn't in the library any more.",
  'rate-limited': 'The library is busy, try again in a minute.',
  'bad-type': "That resource type filter isn't valid."
};

export class LibraryError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Library API ${status} ${code}`);
  }
}

function baseUrl(): string {
  return (process.env.LNET_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/u, '');
}

async function getJson<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const response = await fetch(`${baseUrl()}${path}?${query}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'FinesseBot' },
    signal: AbortSignal.timeout(5_000)
  }).catch(() => {
    throw new LibraryError(0, 'unreachable');
  });
  const data: unknown = await response.json().catch(() => {
    throw new LibraryError(response.status, 'unknown');
  });

  if (!response.ok) {
    throw new LibraryError(response.status, (data as { error?: string }).error ?? 'unknown');
  }
  return data as T;
}

export function searchNetworks(query: SearchQuery): Promise<SearchPage> {
  return getJson('/api/library/search', query);
}

export function getNetwork(id: string): Promise<NetworkDetails> {
  return getJson('/api/library/network', { id });
}

export function errorMessage(error: LibraryError): string {
  return MESSAGES[error.code] ?? "Couldn't reach the network library, try again later.";
}
