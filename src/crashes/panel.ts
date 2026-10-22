import { KineticServer, PanelFile } from './types.js';

async function call<T>(server: KineticServer, path: string, query: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${server.url}/api/client/servers/${server.id}${path}?${new URLSearchParams(query)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${server.apiKey}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Panel API ${response.status} on ${path}`);
  return response.json() as Promise<T>;
}

export async function getSocket(server: KineticServer): Promise<{ token: string; socket: string }> {
  const { data } = await call<{ data: { token: string; socket: string } }>(server, '/websocket');
  return data;
}

export async function readFile(server: KineticServer, file: string): Promise<string> {
  const { attributes } = await call<{ attributes: { url: string } }>(server, '/files/download', { file });
  const response = await fetch(attributes.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`File download ${response.status} for ${file}`);
  return response.text();
}

export function pickCrashReport(files: PanelFile[], since: number): string | undefined {
  const newest = files
    .filter(file => file.is_file && file.name.endsWith('.txt') && Date.parse(file.modified_at) >= since)
    .sort((a, b) => Date.parse(b.modified_at) - Date.parse(a.modified_at))[0];
  return newest && `/crash-reports/${newest.name}`;
}

export async function findCrashReport(server: KineticServer, since: number): Promise<string | undefined> {
  const { data } = await call<{ data: Array<{ attributes: PanelFile }> }>(
    server,
    '/files/list',
    { directory: '/crash-reports' }
  );
  return pickCrashReport(data.map(entry => entry.attributes), since);
}
