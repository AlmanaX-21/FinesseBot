const UPLOAD_URL = 'https://api.mclo.gs/1/log';
const MAX_LINES = 25_000;
const MAX_BYTES = 10 * 1024 * 1024;

export function tail(content: string): string {
  const lines = content.split('\n').slice(-MAX_LINES).join('\n');
  const bytes = Buffer.from(lines);
  if (bytes.length <= MAX_BYTES) return lines;
  const cut = bytes.subarray(-MAX_BYTES).toString();
  return cut.slice(cut.indexOf('\n') + 1);
}

export async function uploadLog(content: string): Promise<string> {
  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'FinesseBot' },
    body: JSON.stringify({ content: tail(content), source: 'FinesseBot' }),
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json().catch(() => ({})) as { success?: boolean; url?: string; error?: string };
  if (!data.success || !data.url) throw new Error(`mclo.gs upload failed: ${data.error ?? response.status}`);
  return data.url;
}
