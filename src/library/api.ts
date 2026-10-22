import { NetworkDetails, SearchPage, SearchQuery } from './types.js';

const DEFAULT_BASE_URL = 'https://logistics-network.almanax21.com';
const MESSAGES: Record<string, string> = {
  'not-found': "That network isn't in the library any more.",
  'bad-type': "That resource type filter isn't valid."
};

export class LibraryError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfter?: number) {
    super(`Library API ${status} ${code}`);
  }
}

function baseUrl(): string {
  return (process.env.LNET_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/u, '');
}

function send(path: string, params: Record<string, string | number | undefined>): Promise<Response> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return fetch(`${baseUrl()}${path}?${query}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'FinesseBot' },
    signal: AbortSignal.timeout(5_000)
  }).catch(() => {
    throw new LibraryError(0, 'unreachable');
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => {
    throw new LibraryError(response.status, 'unknown');
  });

  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    throw new LibraryError(response.status, (data as { error?: string }).error ?? 'unknown', retryAfter);
  }
  return data as T;
}

export async function searchNetworks(query: SearchQuery): Promise<SearchPage> {
  return readJson(await send('/api/library/search', query));
}

export async function getNetwork(id: string): Promise<NetworkDetails> {
  return readJson(await send('/api/library/network', { id }));
}

function wait(seconds = 60): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'a minute' : `${minutes} minutes`;
}

export function errorMessage(error: LibraryError): string {
  if (error.code === 'rate-limited') return `The library is busy, try again in ${wait(error.retryAfter)}.`;
  return MESSAGES[error.code] ?? "Couldn't reach the network library, try again later.";
}
