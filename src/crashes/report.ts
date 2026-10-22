import { EmbedBuilder } from 'discord.js';
import { uploadLog } from './mclogs.js';
import { findCrashReport, readFile } from './panel.js';
import { Crash, CrashLinks, KineticServer } from './types.js';

const REPORT_WINDOW_MS = 2 * 60 * 1000;

function failed(error: Error): undefined {
  console.warn('[Crash Log Error]:', error.message);
  return undefined;
}

async function share(server: KineticServer, file: string | undefined): Promise<string | undefined> {
  return file && uploadLog(await readFile(server, file));
}

export async function collectLogs(server: KineticServer, crash: Crash): Promise<CrashLinks> {
  const [log, report] = await Promise.all([
    share(server, '/logs/latest.log').catch(failed),
    findCrashReport(server, crash.at - REPORT_WINDOW_MS).then(file => share(server, file)).catch(failed)
  ]);
  return { log, report };
}

export function crashEmbed(crash: Crash, links: CrashLinks): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('💥 Server Crashed')
    .addFields(
      { name: 'Exit Code', value: crash.exitCode ?? 'Unknown', inline: true },
      { name: 'Out of Memory', value: crash.outOfMemory ?? 'Unknown', inline: true },
      { name: 'Crash Report', value: links.report ?? 'Not found' },
      { name: 'Latest Log', value: links.log ?? "Couldn't fetch" }
    )
    .setTimestamp(crash.at);
}
