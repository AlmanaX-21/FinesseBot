import { Client } from 'discord.js';
import { getSocket } from './panel.js';
import { collectLogs, crashEmbed } from './report.js';
import { Crash, KineticServer } from './types.js';

const DEFAULT_PANEL_URL = 'https://kineticpanel.net';
const RECONNECT_MS = 30_000;
const CRASH_PATTERN = /crashed state|crash detection is disabled/iu;
const DETAIL_PATTERN = /(Exit code|Out of memory): (\S+)/u;
const ANSI_PATTERN = /\u001b\[[\d;]*m/gu;

export function createCrashTracker(onCrash: (crash: Crash) => void): (line: string) => void {
  let crash: Crash | undefined;
  return line => {
    const text = line.replace(ANSI_PATTERN, '');
    if (CRASH_PATTERN.test(text)) {
      crash = { at: Date.now() };
      onCrash(crash);
      return;
    }
    if (!crash) return;
    const [, key, value] = DETAIL_PATTERN.exec(text) ?? [];
    if (key === 'Exit code') crash.exitCode = value;
    if (key === 'Out of memory') crash.outOfMemory = value;
  };
}

function watchSocket(server: KineticServer, track: (line: string) => void): void {
  const reconnect = (error?: Error) => {
    if (error) console.warn('[Crash Watch Error]:', error.message);
    setTimeout(() => watchSocket(server, track), RECONNECT_MS);
  };

  getSocket(server).then(({ token, socket }) => {
    // DOM types lack undici headers
    const ws = new WebSocket(socket, { headers: { Origin: server.url } } as unknown as string[]);
    const auth = (value: string) => ws.send(JSON.stringify({ event: 'auth', args: [value] }));
    let connected = false;

    ws.onopen = () => auth(token);
    ws.onclose = () => reconnect();
    ws.onmessage = ({ data }) => {
      try {
        const { event, args } = JSON.parse(String(data)) as { event: string; args?: string[] };
        if (event === 'console output' && args) track(args[0]);
        if (event === 'token expiring' || event === 'token expired') {
          getSocket(server).then(fresh => auth(fresh.token)).catch(() => ws.close());
        }
        if (event === 'jwt error') ws.close();
        if (event === 'auth success' && !connected) {
          connected = true;
          console.log(`Crash watch connected to server ${server.id}`);
        }
      } catch (error) {
        console.warn('[Crash Watch Error]:', (error as Error).message);
      }
    };
  }).catch(reconnect);
}

export function startCrashWatch(client: Client): void {
  const server: KineticServer = {
    url: (process.env.KINETIC_PANEL_URL?.trim() || DEFAULT_PANEL_URL).replace(/\/+$/u, ''),
    id: process.env.KINETIC_SERVER_ID?.trim() ?? '',
    apiKey: process.env.KINETIC_API_KEY?.trim() ?? ''
  };
  const channelId = process.env.CRASH_CHANNEL_ID?.trim() ?? '';
  if (!server.id || !server.apiKey || !channelId) {
    console.warn('KINETIC_API_KEY, KINETIC_SERVER_ID or CRASH_CHANNEL_ID is not set; crash watch is disabled');
    return;
  }

  const post = async (crash: Crash) => {
    const links = await collectLogs(server, crash);
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) throw new Error(`Channel ${channelId} can't receive messages`);
    await channel.send({ embeds: [crashEmbed(crash, links)] });
  };

  watchSocket(server, createCrashTracker(crash => {
    post(crash).catch((error: Error) => console.error('[Crash Watch Error]:', error.message));
  }));
}
