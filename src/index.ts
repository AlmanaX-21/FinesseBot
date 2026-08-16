import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

dotenv.config();
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}
import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes
} from 'discord.js';
import { loadConfig } from './config.js';
import { MemberStore } from './database.js';
import { syncMemberRoles, syncGuildRoles } from './assigner.js';
import { commands } from './commands/index.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token) {
  throw new Error('DISCORD_TOKEN environment variable is required');
}

const config = loadConfig();
const store = new MemberStore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

async function registerSlashCommands(appId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token!);
  const body = commands.map(c => c.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(appId), { body });
  }
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  await registerSlashCommands(readyClient.user.id);

  const intervalMs = Math.max(1, config.checkIntervalMinutes) * 60 * 1000;
  setInterval(async () => {
    for (const [, guild] of readyClient.guilds.cache) {
      await syncGuildRoles(guild, config.roles, store);
    }
  }, intervalMs);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild || !message.member) {
    return;
  }

  const count = store.increment(message.guild.id, message.author.id);
  await syncMemberRoles(message.member, config.roles, count);
});

client.on(Events.GuildMemberAdd, async member => {
  if (member.user.bot) {
    return;
  }
  const stats = store.getStats(member.guild.id, member.id);
  await syncMemberRoles(member, config.roles, stats.messageCount);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commands.find(c => c.data.name === interaction.commandName);
  if (command) {
    await command.execute(interaction, config.roles, store);
  }
});

function handleShutdown(): void {
  store.saveSync();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

client.login(token);
